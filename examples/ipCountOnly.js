
var MikroNode = require('../dist/mikronode.js');
// Create API instance to a host.
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);

// Connect to MikroTik device
device.connect(/* socketOpts */).then(([login])=>login('username','password')).then(
	function(conn) { 
		// When all channels are marked done, close the connection.
		conn.closeOnDone(true);

		var channel1=conn.openChannel();
		var channel2=conn.openChannel();

		// get only a count of the addresses.
		channel1.write(['/ip/address/print','=count-only=']);
		// Get all of the addresses
		channel2.write('/ip/address/print');

		// Print data from channel 1
		channel1.data.subscribe(e=>console.log("Data 1: ",e.data));
		// Pring data from channel 2
		channel2.data.subscribe(e=>console.log("Data 2: ",e.data));

	}
);
