// src interface
/* jshint undef: true */
/* globals Promise */
var MikroNode = require('../lib/index.js');

var c1 = MikroNode.getConnection(process.argv[2], process.argv[3], process.argv[4]);
c1.closeOnDone = true;
c1.connect(function(c) {
	var o = c.openChannel();
	o.closeOnDone = true;
	o.write('/interface/print', function(channel) {
		console.log('Getting Interfaces');
		channel.once('done', function(p, chan) {
			var d = MikroNode.parseItems(p);
			d.forEach(function(i) {
				console.log(JSON.stringify(i));
			});
		});
		channel.on('trap', function(trap, chan) {
			console.log('Command failed: ' + trap);
		});
		channel.on('error', function(err, chan) {
			console.log('Oops: ' + err);
		});
	});
	o.write('/ip/route/print', function(channel) {
		console.log('Getting routes');
		channel.on('done', function(p, chan) {
			console.log('Routes:');
			var d = MikroNode.parseItems(p);
			d.forEach(function(i) {
				console.log(JSON.stringify(i));
			});
		});
	});
});

/* Now let's do this with Promises */

var connection = MikroNode.getConnection(process.argv[2], process.argv[3], process.argv[4], {
	closeOnDone : true
});

var connPromise = connection.getConnectPromise().then(function(conn) {
	var chan1Promise = conn.getCommandPromise('/interface/print');
	var chan2Promise = conn.getCommandPromise('/ip/route/print');
	Promise.all([ chan1Promise, chan2Promise ]).then(function resolved(values) {
		console.log('Interfaces via Promise: ' + JSON.stringify(values[0]) + '\n\n');
		console.log('Routes via Promise: ' + JSON.stringify(values[1]) + '\n\n');
	}, function rejected(reason) {
		console.log('Oops: ' + reason);
	});
});
