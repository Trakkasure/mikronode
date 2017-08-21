var MikroNode = require('../dist/mikronode.js');
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);
// By setting TLS options, TLS connection is enabled.

device.connect(/* socketOpts */).then(function([login,socketInfo,...args]){
	// The ability to login or not depending on resolting socket info.
	console.log("Connected: ",socketInfo);
	return login('admin','password'); // must return result of login();
}).then(conn=>{ 
	try {
		console.log("Connected");
		conn.closeOnDone(true);
		var channel=conn.openChannel("address_export");
		channel.closeOnDone(true);

		console.log("Writing command...");
		const p=channel.write('/ip/dhcp-server/lease/listen');

		// Cancel the listen in 60 seconds. Should cause stuff to complete.
		setTimeout(()=>{channel.write('/cancel')},60*1000);
		// p.then(data=>console.log("Data received in promise: ",data));

		channel.data.subscribe(e=>console.log("Data Sub: ",e.data));
		// channel.done.subscribe(data=>console.log("Done Sub %s:",data.cmd.command,MikroNode.resultsToObj(data.data)));

	} catch (e) {
		console.log("Error while running ",e);
	}
},err=>{
  	console.log("Error occured while connecting/logging in ",err);
});
