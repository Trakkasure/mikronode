// src iplist
var MikroNode = require('../lib/index.js');

var c1 = MikroNode.getConnection(process.argv[2], process.argv[3], process.argv[4], {
	timeout : 0
});

var ipList = {};
function ipOutput(p) {
	console.log(JSON.stringify(p));
	var v = MikroNode.parseItems(p)[0]; // Returns a row of items, but we only need one.
	var t = ipList[v['.id']];

	console.log(JSON.stringify(v));
	if (v['.dead']) { // if it was removed...
		if (!t) {
			t = {
				name : "Unknown"
			}; // we don't have this ID in our list.
		}
		console.log('IP: ' + t.address + ' deleted');
		delete ipList[v['.id']];
	} else {
		var c = [];
		if (!t) {
			ipList[v['.id']] = v;
		} else {
			Object.keys(v).forEach(function(k) {
				if (v[k] !== t[k]) {
					if (c.length === 0) {
						c.push('changed ');
					}
					c.push("    (" + k + ')' + t[k] + ' to ' + v[k] + ' ');
					ipList[v['.id']][k] = v[k];
				}
			});
		}
		console.log('IP: address ' + v.address + c.join("\n"));
	}
	return true;
}

function connCallback(connection) {
	var o = connection.openChannel();
	o.addListener('trap', function(e) {
		console.log('There was an error: ' + e);
	});
	o.write('/ip/address/print', function(channel) {
		channel.once('done', function(p) {
			console.log(p);
			var d = MikroNode.parseItems(p);
			d.forEach(function(p) {
				console.log('Loaded: (' + p['.id'] + ')' + p.address);
				ipList[p['.id']] = p;
			});
		});
	});

	o.write('/ip/address/listen', function(channel) {
		console.log('Listening to ip changes.');
		console.log('Press CTRL-C to stop listening.');
		channel.on('done', function() {
			console.log('ip listen done');
		});
		channel.addListener('read', ipOutput); // report when an IP is being addeed.
	});

}
c1.addListener('trap', function(e) {
	console.log('Connection caught a trap: ' + e.message);
});

c1.connect(connCallback);
