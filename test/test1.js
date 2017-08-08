// require('babel-register');

var MikroNode = require('./dist/mikronode.js');
var api = new MikroNode('127.0.0.1');
//api.setDebug(MikroNode.DEBUG);
api.connect('username','password').then(
	function(conn) { 
		console.log("Connected");
		var channel1=conn.openChannel("address_export");
		// var channel2=conn.openChannel();
		conn.closeOnDone(true);
		channel1.write('/ip/export');
		//channel2.write('/user/active/listen');

		channel1.stream.subscribe(e=>console.log("Data 1: ",e));
		//channel2.data.subscribe(e=>console.log("Data 2: ",e));

		//setTimeout(function(){channel2.write('/cancel')},3000);
	}
  , function(err) {
  		console.log("Error occured while connecting ",err);
    }
);
