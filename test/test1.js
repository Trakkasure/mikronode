/* jshint undef: true */
/* globals Promise */

var MikroNode = require('../lib/index.js');

function VLAN(vlan) {
	Object.keys(vlan).forEach(function(k) {
		this[k] = vlan[k];
	});
}

var connection = new MikroNode.Connection(process.argv[2], process.argv[3], process.argv[4], {
	closeOnDone : true,
	closeOnTimeout : true,
	timeout : 4,
	tls : {
		rejectUnauthorized : false
	}
});

var connPromise = connection.getConnectPromise().then(function connected(conn) {
	getVlans();
}, function failed(result) {
	console.log(result);
	process.exit(99);
});

var availableVlan = -1;

function getVlans() {
	var p = connection.getCommandPromise('/interface/vlan/print', {
		closeOnDone : false,
		itemClass : VLAN,
		itemKey : 'vlan-id'
	});
	p.then(function(values) {
		console.log('Got vlans');
		for (var vlan = 3000; vlan < 4000; vlan++) {
			if (!values[vlan]) {
				availableVlan = vlan;
				break;
			}
		}
		if (availableVlan < 0) {
			console.error('No vlans available');
			process.exit(99);
		}
		addVlan();
		p.channel.close();

	});
	p['catch'](function(result) {
		p.channel.close();
		console.log(result);
		process.exit(99);
	});
}

function addVlan() {
	console.log('Adding vlan ' + availableVlan);
	var p = connection.getCommandPromise([ '/interface/vlan/add', '=name=vlan' + availableVlan, '=interface=ether1',
			'=vlan-id=' + availableVlan ], {
		closeOnDone : false
	});
	p.then(function(values) {
		listVlans();
		p.channel.close();
	});
	p['catch'](function(result) {
		p.channel.close();
		console.log(result);
		process.exit(99);
	});
}

function listVlans() {
	console.log('Listing vlans');
	var p = connection.getCommandPromise('/int/vlan/print\n?interface=ether1', {
		closeOnDone : false
	});
	p.then(function(values) {
		console.log(values);
		listen();
		p.channel.close();
	});
	p['catch'](function(result) {
		p.channel.close();
		console.log(result);
		process.exit(99);
	});
}

var listenChannelId;

function listen() {
	var c = connection.openChannel();
	listenChannelId = c.id;
	c.closeOnDone = false;
	c.write('/ip/address/listen', function(channel) {
		console.log('Listening to ip changes.');

		console.log('Press CTRL-C to stop listening.');
		channel.on('done', function() {
			console.log('ip listen done');
			channel.close();
		});
		channel.on('trap', function(result) {
			console.log(result + ': SUCCESS!!');
			cleanup();
			channel.close();
		});
		channel.on('read', function(data) {
			console.log('Heard: ' + data);
			cancelListen();
			channel.close();
		}); // report when an IP is being addeed.
		addIp();
	});
}

function addIp() {
	console.log('Adding IP');
	var p = connection.getCommandPromise('/ip/addr/add', {
		'=interface' : 'vlan' + availableVlan,
		'=address' : '192.168.88.100/24'
	}, {
		closeOnDone : true
	});
	p.then(function(values) {});
	p['catch'](function(result) {
		console.log('Add Address: ' + result.toString());
		process.exit(99);
	});
}

function cancelListen() {
	console.log('Cancelling Listen');
	var p = connection.getCommandPromise('/cancel', {
		'=tag' : listenChannelId
	}, {
		closeOnDone : true
	});
	p.then(function(values) {});
	p['catch'](function(result) {
		console.log('channel ' + p.channel.id + ': ' + result);
	});
}

function cleanup() {
	console.log('Cleaning up');

	var pa = connection.getCommandPromise('/ip/address/print\n?address=192.168.88.100/24', {
		closeOnDone : false
	});

	pa.then(function(values) {
		console.log('Found IP: ', values[0]['.id']);
		var da = connection.getCommandPromise('/ip/addr/remove', {
			'=.id' : values[0]['.id'],
		}, {
			closeOnDone : true
		});
		da.then(function(values) {
			console.log('Removed IP');
		});

		pa.channel.close(true);
	});

	pa['catch'](function(result) {
		console.log(result);
		pa.channel.close(true);
	});

	var pv = connection.getCommandPromise('/int/vlan/print\n?name=vlan' + availableVlan, {
		closeOnDone : false
	});

	pv.then(function(values) {
		console.log('Found VLAN: ', values[0]['.id']);
		var dv = connection.getCommandPromise('/int/vlan/remove', {
			'=.id' : values[0]['.id'],
		}, {
			closeOnDone : true
		});
		dv.then(function(values) {
			console.log('Removed VLAN');
		});

		pv.channel.close(true);
	});

	pv['catch'](function(result) {
		console.log(result);
		pv.channel.close(true);
	});

}