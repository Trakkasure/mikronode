var MikroNode = require('../src/index.js');
var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);
device.connect('admin', 'password').then(function (conn) {
    conn.closeOnDone(true); 
    let chan = conn.openChannel('1')
    //chan.sync(true);
    chan.sync(true)
    chan.done.subscribe(data=>{
        console.log("Got chan done:",data);
    },error=>{
        console.log("Error done: ",error);
    },()=>{
        console.log("Closed done: ");
    });
    const p=chan.write('/ip/address/add',{
        'interface':'LAN',
        'network':'255.255.255.0',
        'address':'10.0.0.1'
    })
    p.then(e=>{
        // const x=chan.write('/ip/address/remove',{
        //     '.id':e.data
        // });
        // console.log("ID of write:",x.commandId);
        return e;
    }).catch(e=>{
        console.log("Promise rejected",e);
    });
    console.log("***************************")
    chan.write('/ip/address/print').then(data=>{
        console.log("Done promise all data:", data);
    });
});