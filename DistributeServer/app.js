
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var util = require('util');
var config = require('./config.js');
var DistributeServer = require('./DistributeServer.js');

var app = express();

app.set('port', process.env.PORT || config.webPort);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('view cache', true);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.compress());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.basicAuth(config.username, config.password));
app.use(app.router);
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);
app.get('/run', function(req, res) {
  /// <param name="req" type="http.IncomingMessage"> request </param>
  /// <param name="res" type="http.ServerResponse"> response </param>
  var name = req.query.name;
  var command = req.query.command;
  var id = req.query.id;
  if (!command)
    command = DistributeServer.nodeStartCommand;
  if (name) {
    var client = DistributeServer.clientsByName[name];
    if (client && client.socket) {
      client.sendCommand("RUN", command);
      client.once('run', res.redirect.bind(res,'/'));
    }else {
      res.end('client not found');
    }
  } else if (id) {
    var client = DistributeServer.clients[id];
    if (client && client.socket) {
      client.sendCommand("RUN", command);
      client.once('run', res.redirect.bind(res,'/'));
    }else {
      res.end('client not found');
    }
  }else {
    DistributeServer.clients.forEach(function (v,i,a) {
      v.sendCommand("RUN", command);
    });
    res.redirect('/');
  }
});
app.get('/state', function(req, res) {
  res.end(util.inspect(DistributeServer.clients));
});
app.get('/stop', function(req, res) {
  var name = req.query.name;
  var id = req.query.id;
  if (name) {
    var client = DistributeServer.clientsByName[name];
    if (client && client.socket) {
      client.sendCommand("STOP", "");
      client.once('stop', res.redirect.bind(res,'/'));
    }else {
      res.end('client not found');
    }
  } else if (id) {
    var client = DistributeServer.clients[id];
    if (client && client.socket) {
      client.sendCommand("STOP", "");
      client.once('stop', res.redirect.bind(res,'/'));
    }else {
      res.end('client not found');
    }
  } else {
    DistributeServer.clients.forEach(function (v,i,a) {
      v.sendCommand("STOP", "");
    });
    res.redirect('/');
  }
});

app.get('/reset', function(req, res) {
  DistributeServer.clients.forEach(function (v,i,a) {
    v.rebootCount = 0;
    v.reconnectCount = 0;
    v.lastShareCount = 0;
  });
  res.redirect('/');
});

app.get('/console', function(req, res) {
  var id = req.query.id;
  var client = DistributeServer.clients[id];
  if (client && client.socket) {
    client.sendCommand("CONSOLE", "");
    client.once('console', function (data) {
      res.end(data);
    });
  } else {
    res.end('client not found');
  }
});

app.get('/hide', function(req, res) {
  var id = req.query.id;
  var client = DistributeServer.clients[id];
  if (client) {
    client.state = DistributeServer.states.HIDDEN;
    res.redirect('/');
  } else {
    res.end('client not found');
  }
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
DistributeServer.nodeStartCommand = config.command;
DistributeServer.listen(config.clientPort);