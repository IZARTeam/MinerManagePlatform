
/*
 * GET home page.
 */
var DistributeServer = require('../DistributeServer.js');
Date.prototype.getFormated = function() {
  function pad(number) {
    if (number < 10) return '0' + number;
    return number;
  }
  var d = this.getFullYear() + '-' + pad(this.getMonth() + 1) + '-' + pad(this.getDate());
  var t = pad(this.getHours()) + ':' + pad(this.getMinutes()) + ':' + pad(this.getSeconds());
  return d + ' ' + t;
};
exports.index = function(req, res){
  res.render('index', { 
    title: 'DistributePlatform',
    clients: DistributeServer.clients.concat().sort(function(a,b) {
      return ((a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0));
    })
  });
};