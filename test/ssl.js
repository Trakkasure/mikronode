var MikroNode = require('../dist/mikronode.js');
var device = new MikroNode('10.10.10.10',8729); // We specify the SSL/TLS port of our Mikrotik here.
0
// device.setDebug(MikroNode.DEBUG);

// By setting TLS options, TLS connection is enabled.
device.TLS({
	rejectUnauthorized : false,
	// If your mikrotik does not have a valid certificate, this cipher is the only one that will work.
	ciphers:'ADH'
});

device.connect(/* socketOpts */).then(function([login,socketInfo]){
	// The ability to login or not depending on resolting socket info.
	console.log("Connected.\nLogging in.");
	return login('admin','password'); // must return result of login();
}).then(function(conn) { 
	try {
		console.log("Login complete. Ready for command.");
		conn.closeOnDone(true);
		var channel=conn.openChannel("address_export");
		channel.closeOnDone(true);

		console.log("Writing command to listen for DHCP lease changes.");
		const p=channel.write('/ip/dhcp-server/lease/listen').catch(e=>{
            console.log("Cancel processed");
        });

		// Cancel the listen in 60 seconds. Should cause stuff to complete.
		setTimeout(()=>{channel.write('/cancel').then(()=>{console.log("Sent cancel.")})},10*1000);
		// p.then(data=>console.log("Data received in promise: ",data));

		channel.data.subscribe(e=>console.log("Data Sub: ",MikroNode.resultsToObj(e.data)));
		// channel.done.subscribe(data=>console.log("Done Sub %s:",data.cmd.command,MikroNode.resultsToObj(data.data)));

	} catch (e) {
		console.log("Error while running ",e);
	}
}).catch(err=>{
  	console.log("Error occured while connecting/logging in ",err);
});
