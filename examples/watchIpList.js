var MikroNode = require('..');
var device = new MikroNode('10.10.10.1');
device.setDebug(MikroNode.DEBUG);


device.connect('userame','password').then(function(conn) {

	var channel=conn.openChannel();
	channel.closeOnDone();
	var listener=conn.openChannel();


	channel.write('/ip/address/print');
	listner.write('/ip/address/listen');


	channel.bufferedStream.merge(listener).scan(function(last,stream,idx) {
		if (Array.isArray(stream)) return last.concat(stream);
		else if (stream['.dead']) {
			return last.filter(function(n) {
				return n['.id'] !== stream['.id'];
			});
		} else return last.concat(stream);
	},[]).subscribe(function(ipList) {
		console.log("New IP List",ipList);
	});

	var ipList=[];
	channel.bufferedStream.concat(listener).subscribe(function(stream) {
		if (Array.isArray(stream)) ipList=stream;
		else if (stream['.dead']) {
			ipList=last.filter(function(n) {
				return n['.id'] !== stream['.id'];
			});
		} else ipList=last.concat(stream);
	}).subscribe(function(change) {
		console.log("IP change ",change);
	});
})

