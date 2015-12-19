// src interface
var api = require('../lib/index.js');

c1 = new api('192.168.0.1', 'admin', '');
c1.closeOnDone(true);
c1.connect(function(c) {
	var o = this.openChannel();
	o.closeOnDone(true);
	o.write([ '/interface/print' ], function(channel) {
		console.log('Getting Interfaces');
		channel.once('done', function(p, chan) {
			p = api.parseItems(p);
			p.forEach(function(i) {
				console.log(JSON.stringify(i))
			});
		});
	});
	o.write('/ip/route/print', function(channel) {
		console.log('Getting routes');
		channel.on('done', function(p, chan) {
			console.log('Routes:');
			p = api.parseItems(p);
			p.forEach(function(i) {
				console.log(JSON.stringify(i))
			});
		});
	});
});
