var MikroNode = require('../src');
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);

device.connect('admin', 'password').then(function (conn) {
    console.log("Connected");
    // When all channels are complete close the connection.
    conn.closeOnDone(true); 

    // Open new channel named "1" with auto close on.
    let chan = conn.openChannel('1',true)

    // Force sync command mode.
    chan.sync(true);

    // Write first command. P is a promise returned. We show how we can handle it at a later time.
    const p=chan.write('/ip/address/add',{
        'interface':'LAN',
        'network':'255.255.255.0',
        'address':'10.0.0.1'
    });

    // Writing the same IP again will cause a trap.
    chan.write('/ip/address/add',{
        'interface':'LAN',
        'network':'255.255.255.0',
        'address':'10.0.0.1'
    }).then(data=>{
        // Do nothing, since this shouldn't get here.
    }).catch(error=>{
        console.log("Yes. a Trap occurred as expected");
    });

    p.then(data=>{
        // remove the address when the original was complete done.
        const x=chan.write('/ip/address/remove',{
            '.id':data.data
        });
        console.log("ID of write:",x.commandId);
    }).catch(e=>{
        console.log("Add command trap: ",e);
    });

    // Print the list of addresses.. we should see 10.0.0.1 since we are queueing this command before the first promise is resolved.
    const j=chan.write('/ip/address/print').then(data=>{
        // Show ALL data.
        console.log("Done promise all data:", data);
    }).catch(e=>{
        // We shouldn't get to this line.
        console.log("Print command trap: ",e.error);
    });

    // Capture any trap on channel "1"
    chan.trap.subscribe(error=>{
        console.log("Trap recieved on channel.");
    });

    // Listen to individual sentences.
    chan.data.subscribe(data=>{
        // Print each line as it arrives.
        console.log("Chan data:",data);
    },error=>{
        // This should never happen.
        console.log("Error data: ",error);
    },()=>{
        // When we are all done (channel is closed).
        console.log("Closed data: ");
    });

    chan.done.subscribe(data=>{
        console.log("Got chan done:",data);
    },error=>{
        // This should never happen
        console.log("Error done: ",error);
    },()=>{
        // When we are all closed.
        console.log("Closed done: ");
    });
});