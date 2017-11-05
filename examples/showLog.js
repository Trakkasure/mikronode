
var MikroNode = require('../dist/mikronode.js');

// Create API link to host. No connection yet..
var device = new MikroNode('10.10.10.10');

// Debug level is "DEBUG"
// device.setDebug(MikroNode.DEBUG);

var removeId=[];
// Connect to the MikroTik device.
device.connect()
      .then(([login])=>login('username','password'))
      .then(function(conn) {

        console.log("Connected")
    // var channel=conn.openChannel('all_addresses');
    // channel.closeOnDone(true); // only use this channel for one command.
    var listener=conn.openChannel('address_changes');
    listener.closeOnDone(true); // only use this channel for one command.

    // channel.write('/ip/address/print');
    listener.write('/log/listen');
    // channel.write('/ip/firewall/filter/print');

    listener.data.filter(d=>d.data[d.data.length-1].field!=='.dead').subscribe(d=>{
        const data = MikroNode.resultsToObj(d.data.filter(col=>["time","topics","message"].indexOf(col.field)!=-1));
        console.log("Log:",JSON.stringify(data));
    });

    // in 5 seconds, stop listening for address changes.
    setTimeout(function() {
        console.log("Closing out listener");
        listener.write('/cancel'); /* cancel listen */
    },500000);
}).catch(function(err) {
    console.log("Failed to connect. ",err);
});

