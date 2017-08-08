// src getlist
var MikroNode = require('../lib/index.js');

var connection = MikroNode.getConnection(process.argv[2], process.argv[3], process.argv[4]);
connection.connect(function(conn) {

	var chan = conn.openChannel();
	conn.closeOnDone = true;
	chan.write('/ip/address/print', function() {
		chan.closeOnDone = true;
		chan.on('done', function(data) {
			var parsed = MikroNode.parseItems(data);
			parsed.forEach(function(item) {
				console.log('Interface/IP: ' + item.interface + "/" + item.address);
			});
		});
		chan.once('trap', function(trap, chan) {
			console.log('Command failed: ' + trap);
		});
		chan.once('error', function(err, chan) {
			console.log('Oops: ' + err);
		});
	});
});

/* Now let's do this with Promises */

var connection = MikroNode.getConnection(process.argv[2], process.argv[3], process.argv[4], {
	closeOnDone : true
});

connection.getConnectPromise().then(function(conn) {
	conn.getCommandPromise('/ip/address/print').then(function resolved(values) {
		console.log('Addreses: ' + JSON.stringify(values));
	}, function rejected(reason) {
		console.log('Oops: ' + JSON.stringify(reason));
	});
});
