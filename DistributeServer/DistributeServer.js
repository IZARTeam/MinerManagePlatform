var net = require('net');
var dgram = require('dgram');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function debug() {
  if (exports.debug)
    console.log.apply(console, arguments);
}

function DistributeClient(name) {
  /// <field name="socket" type="net.Socket"> 客户端Socket </field>
  this.socket = null;
  this.name = name;
  this.state = exports.states.DISCONNECTED;
  this.nodeState = exports.nodeStates.STOPPED;
  this.lastReboot = new Date();
  this.lastConnect = new Date();
  this.rebootCount = -1;
  this.reconnectCount = -1;
  this.cycleTime = 0;
  this.collisionPerMinute = 0;
  this.lastShareCount = 0;
  this.shareCount = 0;
  this.lastError = "";
  this.id = -1;
  this.largeData = false;
  this.largeDataLength = 0;
  this.largeDataReceive = 0;
  this.largeDataCommand = "";
  this.largeDataBuffer = [];
  return this;
}

util.inherits(DistributeClient, EventEmitter);

DistributeClient.prototype.bindSocket = function (socket) {
  /// <param name="socket" type="net.Socket"> 用于绑定到客户端类上的Socket </param>
  var self = this;
  self.state = exports.states.CONNECTED;

  socket.setKeepAlive(true, 120000);
  debug('[DistrServer] %s is connected', self.name);

  function errorHandler(err) {
    if (self.socket) {
      self.state = exports.states.DISCONNECTED;
      self.collisionPerMinute = 0;
      debug('[DistrServer] %s is disconnected', self.name);
      self.socket.destroy();
      self.socket = null;
    }
  };
  
  socket.on('data', function (data) {
    if (!self.largeData) {
      dataStr = data.toString()
      debug('[%s] recv: %s', self.name, data);
      var command = dataStr.substr(0,2);
      var param = dataStr.substr(2);
      if (command == 'NR') { //Node Run
        self.lastShareCount += self.shareCount;
        self.shareCount = 0;
        self.nodeState = exports.nodeStates.RUNNING;
        self.emit('run');
        debug('[%s] computing process is run', self.name);
      } else if (command == 'NS') { //Node Stop
        self.collisionPerMinute = 0.00;
        self.nodeState = exports.nodeStates.STOPPED;
        self.emit('stop');
        debug('[%s] computing process is stopped', self.name);
      } else if (command == 'NE') { //Node Error
        debug('[%s] process start error, reason: %s', self.name, param);
        self.collisionPerMinute = 0.00;
        self.nodeState = exports.nodeStates.ERROR;
        self.lastError = param;
        self.emit('stop');
      } else if (command == 'PI') { //Performance Info
        try{
          var info = JSON.parse(param);
          self.collisionPerMinute = info.collisionPerMinute;
          self.shareCount = info.shareCount;
          self.cycleTime = info.cycleTime;
          client.emit('stat');
        }catch(e){
        }
      } else if (command == 'CA') {//Console Data
        self.largeData = true;
        self.largeDataLength = data.readUInt32LE(2);
        var content = data.slice(6);
        self.largeDataCommand = 'console';
        self.processLargeData(content);
      }
    } else {
      self.processLargeData(data);
    }
  });

  socket.on('error', errorHandler.bind(self, 'error'));
  socket.on('timeout', errorHandler.bind(self, 'timeout'));
  socket.on('close', errorHandler.bind(self, 'close'));

  this.socket = socket;
};

DistributeClient.prototype.sendCommand = function (command, param) {
  /// <param name="command" type="String"> 向客户端发送的命令 </param>
  /// <param name="param" type="String"> 命令所对应的参数 </param>
  if (this.socket) {
    this.socket.write(JSON.stringify({
      command: command,
      param: param
    }));
  }
};

DistributeClient.prototype.processLargeData = function (data) {
  var self = this;
  self.largeDataBuffer.push(data);
  self.largeDataReceive += data.length;
  if (self.largeDataReceive >= self.largeDataLength) {
    self.emit(self.largeDataCommand, Buffer.concat(self.largeDataBuffer));
    self.largeData = false;
    self.largeDataBuffer = [];
    self.largeDataLength = 0;
    self.largeDataReceive = 0;
  }
};

DistributeClient.createClient = function (socket) {
  /// <param name="socket" type="net.Socket"> 用于创建或绑定到客户端类上的Socket </param>
  socket.once('data', function (data) {
    socket.removeAllListeners('error');
    data = data.toString();
    //根据初次发送的数据包来判断是否为分布式平台的客户端
    if (data[0] == 'F' || data[0] == 'R') {
      var name = data.substr(1);
      var client;
      var newclient = false;
      if (exports.clientsByName[name]) {
        client = exports.clientsByName[name];
        client.bindSocket(socket);
      } else {
        client = new DistributeClient(name);
        client.id = exports.clients.push(client) - 1;
        exports.clientsByName[name] = client;
        client.bindSocket(socket);
        newclient = true;
      }
      //当检测到客户端是首次启动的时候，发送启动命令到客户端上
      if (data[0] == 'F' || newclient) {
        client.rebootCount++;
        client.sendCommand("RUN", exports.nodeStartCommand);
        client.lastReboot = new Date();
      }
      client.lastConnect = new Date();
      setTimeout(client.sendCommand.bind(client, "ID", client.id), 1000);
      client.reconnectCount++;
    } else {
      socket.end();
      socket.destroy();
    }
  });
  socket.on('error', function() {
    socket.destroy();
  });
};

var server = net.createServer(function (sck) {
  DistributeClient.createClient(sck);
});

var statServer = dgram.createSocket('udp4', function(msg, rinfo){
  if (msg.length < 16) return;
  var id = msg.readUInt32LE(0);
  var cycleTime = msg.readUInt32LE(4);
  var cpm = parseFloat(msg.readFloatLE(8).toFixed(2));
  var shares = msg.readUInt32LE(12);
  if (!exports.clients[id]) return;
  var client = exports.clients[id];
  client.collisionPerMinute = cpm;
  client.shareCount = shares;
  client.cycleTime = cycleTime;
  client.emit('stat');
  debug('[%s] Cycle Time: %s, cpm: %s, shares: %s', client.name, cycleTime, cpm, shares);
});

exports.debug = false;
exports.nodeStartCommand = "";
exports.clients = [];
exports.clientsByName = {};
exports.states = {
  HIDDEN: -2,
  DISCONNECTED: -1,
  CONNECTED: 0
};
exports.nodeStates = {
  STOPPED: 0,
  RUNNING: 1,
  ERROR: 2
};
exports.listen = function (port) {
  server.listen(port);
  statServer.bind(port);
};