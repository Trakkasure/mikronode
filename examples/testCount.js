
var MikroNode = require('../dist/mikronode.js');
// Create API instance to a host.
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);

// Connect to MikroTik device
device.connect().then(([login])=>login('admin','password')).then(conn=>{
		// When all channels are marked done, close the connection.
	    console.log('connected');

		conn.closeOnDone(true);

		var channel1=conn.openChannel();
		channel1.closeOnDone(true);

		console.log('going write 1');

		// get only a count of the addresses.
		channel1.write('/ip/address/print',{
			'=count-only=':''
		}).then(data=>{
			console.log("Done",JSON.stringify(data));
		}).catch(error=>{
			console.log("Error result ",error);
		});
		console.log('Wrote');
	}
).catch(error=>{
	console.log("Error logging in ",error);
});
