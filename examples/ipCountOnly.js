
var MikroNode = require('../dist/mikronode.js');
var api = new MikroNode('10.10.10.1');
api.setDebug(MikroNode.DEBUG);

/* this example isn't working. Sentence Parser needs updating to handle =re= after tag line. */
api.connect('test','').then(
	function(conn) { 
		console.log("Connected");
		conn.closeOnDone(true);
		var channel1=conn.openChannel();
		var channel2=conn.openChannel();
		channel1.write(['/ip/address/print','=count-only=']);
		channel2.write('/ip/address/print');

		channel1.data.subscribe(e=>console.log("Data 1: ",e));
		channel2.data.subscribe(e=>console.log("Data 2: ",e));

	}
);
