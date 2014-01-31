var net = require('net');
var child = require('child_process');
var http = require('http');
var dgram = require('dgram');
var AutoSocket = require('./AutoSocket.js');
AutoSocket.reconnectDelay = 5000;

var config = {
  name : process.env.COMPUTERNAME ,
  host : '127.0.0.1', //在此输入管理平台的IP地址
  port : 9080,        //在此输入管理平台上所设置的端口
  device : process.argv[2]
};
var socket = new AutoSocket(config.port, config.host);
var udpSocket = dgram.createSocket('udp4');
var statBuffer = Buffer(16);
var start = true;
var compute_node = null;
var clientID = -1;
var consoleBuffer = []; //控制台缓冲区
consoleBuffer.newline = Buffer(1024);
consoleBuffer.pos = 0;
consoleBuffer.max = 0;
consoleBuffer.maxLine = 300;

//处理对多显卡的支持
if (config.device != undefined)
	config.name += '-' + config.device;

//处理stdout数据，转换到控制台缓冲区上
function parseConsole(data) { //完成
  //console.log(data.toString());
  var buf = consoleBuffer;
  for (var i = 0; i < data.length; i++) {
    if (data[i] == 13) { //处理\r
      buf.pos = 0;
    } else if (data[i] == 10) { //处理\n
      buf.push(buf.newline.slice(0, buf.max).toString());
      buf.max = 0;
      buf.pos = 0;
      if (buf.length > buf.maxLine)
        buf.shift();
    } else if (data[i] == 8) { //处理\b
      if (buf.pos > 0)
        buf.pos--;
    } else { //处理正常内容
      buf.newline[buf.pos++] = data[i];
      if (buf.pos > buf.max)
        buf.max = buf.pos;
    }
  }
}

//处理stdout数据，分析后发送到服务器端
var performanceCounter = 0;//节点性能信息出现次数计数器
function parseOutput(data) {
  var outstr = data.toString();
  var reg = /Cycle time: (\d+)ms GPU time: [\d\.]+ms cpm: ([\d+\.]+) spm: [\d+\.]+ Shares: (\d+)/;
  var result = reg.exec(outstr);
  if (result) {
    performanceCounter++;
    if (performanceCounter >= 30) {
      performanceCounter = 0;
      if (clientID >= 0) {
        var info = {
          cycleTime : parseInt(result[1]),
          collisionPerMinute : parseFloat(result[2]),
          shareCount : parseInt(result[3])
        };
        statBuffer.writeUInt32LE(clientID, 0);
        statBuffer.writeUInt32LE(parseInt(result[1]), 4);//Cycle time
        statBuffer.writeFloatLE(parseFloat(result[2]), 8);//cpm
        statBuffer.writeUInt32LE(parseInt(result[3]), 12);//shares
        udpSocket.send(statBuffer, 0, statBuffer.length, config.port, config.host);
      }
    }
  }
}

//启动计算节点
function prepairComputeNode(command) {
  params = command.split(' ');
  //console.log("exe:" + params[0]);
  //console.log("param:" + params.slice(1).join(' '));
  try {
    compute_node = child.spawn(params[0], params.slice(1));
    compute_node.stdout.on('data', parseConsole);
    compute_node.stderr.on('data', parseConsole);
    compute_node.stdout.on('data', parseOutput);
    compute_node.on('exit', function() {
      var buf = consoleBuffer;
      buf.push(buf.newline.slice(0, buf.max).toString());
      buf.max = 0;
      buf.pos = 0;
      if (!this.scheduled)
        socket.write('NS');
      console.log('process has exit');
    });
    compute_node.on('error', function(e) {
      socket.write('NE' + e.toString());
      console.log(e);
    });
    socket.write('NR');
  } catch (e) {
    socket.write('NE' + e.toString());
    console.log(e);
  }
}

socket.on('connect', function() {
  if (start) {
    socket.write('F' + config.name);
    start = false;
  } else {
    socket.write('R' + config.name);
    if (compute_node) {
      setTimeout(socket.write.bind(socket, 'NR'), 1000);
    } else {
      setTimeout(socket.write.bind(socket, 'NS'), 1000);
    }
  }
});

socket.on('data', function(data) {
  data = JSON.parse(data.toString());
  console.log(data);
  var command = data.command;
  var param = data.param;
  if (command == 'RUN') {
    if (compute_node != null) {
      compute_node.scheduled = true;
      compute_node.stdin.end();
      setTimeout(compute_node.kill.bind(compute_node), 1000);
      compute_node = null;
    }
    if (config.device != undefined)
      param = param.replace('-d 0', '-d ' + config.device);
    prepairComputeNode(param);
  } else if (command == 'STOP') {
    if (compute_node != null) {
      compute_node.stdin.end();
      setTimeout(compute_node.kill.bind(compute_node), 1000);
      compute_node = null;
    } else {
      socket.write('NS');
    }
  } else if (command == 'CONSOLE') {
    var consoleData = consoleBuffer.join('\r\n') + '\r\n' + consoleBuffer.newline.slice(0, consoleBuffer.max).toString();
    consoleData = Buffer(consoleData);
    var header = Buffer('CA0000');
    header.writeUInt32LE(consoleData.length, 2);
    socket.write(Buffer.concat([header, consoleData]));
  } else if (command == 'ID') {
    clientID = param;
  }
});

var server = http.createServer(function (req,res) {
  var url = unescape(req.url);
  var command = "";
  var param = "";
  if (url.search('\\?') >= 0) {
    command = url.substr(1, url.search('\\?') - 1);
    param = url.substr(url.search('\\?') + 1);
  } else {
    command = url.substr(1);
  }
  if (command == 'RUN') {
    if (compute_node != null) {
      compute_node.kill();
      compute_node = null;
    }
    prepairComputeNode(param);
    res.end('OK');
  } else if (command == 'STOP') {
    compute_node.stdin.end();
    res.end('OK');
  } else if (command == 'CONSOLE') {
    res.end(consoleBuffer.join('\r\n') + '\r\n' + consoleBuffer.newline.slice(0, consoleBuffer.max).toString());
  } else {
    res.end('ERR');
  }
});

udpSocket.on('error', function(err) {
  console.log(err);
});

process.stdin.resume();