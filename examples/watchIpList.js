
var MikroNode = require('../dist/mikronode.js');

// Create API link to host. No connection yet..
var device = new MikroNode('10.10.10.1');

// Debug level is "DEBUG"
device.setDebug(MikroNode.DEBUG);

var removeId=[];
// Connect to the MikroTik device.
device.connect('username','password').then(function(conn) {

    var channel=conn.openChannel('all_addresses');
    channel.closeOnDone(true); // only use this channel for one command.
    var listener=conn.openChannel('address_changes');

    channel.write('/ip/address/print');
    listener.write('/ip/address/listen');

    channel.done //merge done with data from firewall connections. why? no reason.
        .merge(listener.data)
        .scan(function(last,stream,idx) {
            // console.log('Concat stream data to last',JSON.stringify(stream,true,2));
            if (stream.type==='done') {
                console.log('Concat stream data to last',stream.type);
                return last.concat(stream.data.map(MikroNode.resultsToObj));
            }
            else {
                const data = MikroNode.resultsToObj(stream.data);
                if (data['.dead']) {
                return last.filter(function(n) {
                    n=MikroNode.resultsToObj(n);
                    return n.field=='.id' !== data['.id'];
                });
                } else {
                    console.log("New IP detected",data);
                    removeId.push(data['.id']);
                    return last.concat(stream.data);
                }
            }
        },[]).subscribe(function(changes) {
            ipList=changes;
        });

    const addressInjector=conn.openChannel('address_inject');

    setTimeout(function() {
        console.log("Delete one...");
        // addressInjector.write('/ip/address/remove',{
        //     '.id':removeId.pop()
        // });
        },2000);

    listener.trap.subscribe(t=>{

        console.log("Ip list on trap:",ipList);
        // Don't care about why.. just remove the new ones.

        // addressInjector.write('/ip/address/remove',{
        //     '.id':removeId.pop()
        // });
        // addressInjector.write('/ip/address/remove',{
        //     '.id':removeId.pop()
        // });
    })

    addressInjector.write('/ip/address/add',{
        'address'   :'10.1.1.1',
        'interface' :'ether1',
        'netmask'   :'255.255.255.252',
        'disabled'  :'yes'
    });

    addressInjector.write('/ip/address/add',{
        'address'   :'10.1.1.2',
        'interface' :'ether1',
        'netmask'   :'255.255.255.252',
        'disabled'  :'yes'
    });

    addressInjector.write('/ip/address/print')

    addressInjector.data.subscribe(d=>console.log('Data: ',d));

    var ipList=[];
    // channel.bufferedStream.concat(listener).subscribe(function(stream) {
    //  if (Array.isArray(stream)) ipList=stream;
    //  else if (stream['.dead']) {
    //      ipList=last.filter(function(n) {
    //          return n['.id'] !== stream['.id'];
    //      });
    //  } else ipList=last.concat(stream);
    // }).subscribe(function(change) {
    //  console.log("IP change ",change);
    // });

    // in 5 seconds, stop listening for address changes.
    setTimeout(function() {
        console.log("Closing out listener");
        listener.write('/cancel'); /* cancel listen */
        },5000);
},function(err) {
    console.log("Failed to connect. ",err);
});

