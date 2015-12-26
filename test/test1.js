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
	timeout : 4
});

var connPromise = connection.getConnectPromise().then(function connected(conn) {
	getVlans();
}, function failed(result) {
	console.log(result);
	process.exit(99);
});

function getVlans() {
	var p = connection.getCommandPromise('/interface/vlan/print', {
		closeOnDone : false,
		itemClass : VLAN,
		itemKey : 'vlan-id'
	});
	p.then(function(values) {
		console.log('Got vlans');
		var availableVlan = -1;
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
		addVlan(availableVlan);
		p.channel.close();

	});
	p['catch'](function(result) {
		p.channel.close();
		console.log(result);
		process.exit(99);
	});
}

function addVlan(vlan) {
	console.log('Adding vlan ' + vlan);
	var p = connection.getCommandPromise([ '/interface/vlan/add', '=interface=ether1', '=vlan-id=' + vlan ], {
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
	c.closeOnDone = true;
	c.write('/ip/address/listen', function(channel) {
		console.log('Listening to ip changes.');

		console.log('Press CTRL-C to stop listening.');
		channel.on('done', function() {
			console.log('ip listen done');
		});
		channel.on('trap', function(result) {
			console.log(result + ': SUCCESS!!');
		});
		channel.on('read', function(data) {
			console.log('Heard: ' + data);
			cancelListen();
		}); // report when an IP is being addeed.
		addIp();
	});
}

function addIp() {
	console.log('Adding IP');
	var p = connection.getCommandPromise('/ip/addr/add', {
		'=interface' : 'ether1',
		'=address' : '192.168.88.100/24'
	}, {
		closeOnDone : false
	});
	p.then(function(values) {
		p.channel.close();
	});
	p['catch'](function(result) {
		p.channel.close();
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
