var MikroNode = require('../src');
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);
device.connect('admin','password').then(conn=>{ 
	try {
		console.log("Connected");
		conn.closeOnDone(true);
		var channel=conn.openChannel("address_export");
		channel.closeOnDone(true);

		console.log("Writing command...");
		const p=channel.write('/ip/address/print');

		p.then(()=>console.log("Command Written"));
		p.done.then(data=>console.log("Data received in promise: ",data));

		channel.data.subscribe(e=>console.log("Data Sub: ",e.data));
		channel.done.subscribe(data=>console.log("Done Sub:",data));

	} catch (e) {
		console.log("Error while running ",e);
	}
},err=>{
  	console.log("Error occured while connecting ",err);
});
