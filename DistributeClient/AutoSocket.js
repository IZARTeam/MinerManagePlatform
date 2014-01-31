var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function debug() {
  if (AutoSocket.debug)
    console.log.apply(console, arguments);
}

function AutoSocket() {
  this.config = [];
  this.socket = null;
  this.reconnectDelay = AutoSocket.reconnectDelay;
  if (arguments.length > 0)
    this.connect.apply(this, arguments);
  return this;
}

util.inherits(AutoSocket, EventEmitter);

AutoSocket.reconnectDelay = 1000;
AutoSocket.reconnectDelayMax = 300000;
AutoSocket.debug = true;

AutoSocket.prototype.connect = function() {
  var self = this;
  var socket;
  if (arguments.length == 0) {
    if (this.config.length == 0)
      throw "Start new connect with no arguments";
    socket = net.connect.apply(net, this.config);
  } else {
    socket = net.connect.apply(net, arguments);
    this.config = arguments;
  }

  this.socket = socket;

  debug('[AutoSocket] Connect to ' + self.config[1] + ':' + self.config[0]);

  socket.on('connect', function () {
    self.reconnectDelay = AutoSocket.reconnectDelay;
    self.socket.setKeepAlive(true, 120000);
    debug('[AutoSocket] Connected.');
    self.emit('connect');
  });

  function errorHandler (err) {
    if (self.socket) {
      debug('[AutoSocket] Connection %s, try reconnect after %s second', err , Math.floor(self.reconnectDelay / 1000));
      self.reconnectDelay *= 2;
      if (self.reconnectDelay > AutoSocket.reconnectDelayMax)
        self.reconnectDelay = AutoSocket.reconnectDelayMax;
    
      self.socket.destroy();
      self.socket = null;
      setTimeout(self.connect.bind(self), self.reconnectDelay);
    }
  };

  socket.on('error', errorHandler.bind(self, 'error'));
  socket.on('timeout', errorHandler.bind(self, 'timeout'));
  socket.on('close', errorHandler.bind(self, 'close'));

  socket.on('data', this.emit.bind(this, 'data'));
};

AutoSocket.prototype.write = function() {
  if (this.socket != null) {
    debug('[AutoSocket] send:' + arguments[0]);
    return this.socket.write.apply(this.socket, arguments);
  } else {
    return 'no socket';
  }
};

module.exports = AutoSocket;