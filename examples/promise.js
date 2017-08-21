require('babel-register');var MikroNode = require('../src');

var device = new MikroNode('10.10.10.10');
// device.setDebug(MikroNode.DEBUG);
device.connect().then(([login])=>login('admin','password')).then(function(conn) {
    console.log("Logged in.");
    conn.closeOnDone(true); // All channels need to complete before the connection will close.
    var listenChannel=conn.openChannel("listen");

    // Each sentence that comes from the device goes through the data stream.
    listenChannel.data.subscribe(function(data) {
        // var packet=MikroNode.resultsToObj(data);
        console.log('Interface change: ',JSON.stringify(data));
    },error=>{
        console.log("Error during listenChannel subscription",error) // This shouldn't be called.
    },()=>{
        console.log("Listen channel done.");
    });

    // Tell our listen channel to notify us of changes to interfaces.
    listenChannel.write('/interface/listen').then(result=>{
        console.log("Listen channel done promise.",result);
    })
    // Catch shuold be called when we call /cancel (or listenChannel.close())
    .catch(error=>console.log("Listen channel rejection:",error));

    // All our actions go through this.
    var actionChannel=conn.openChannel("action",false); // don't close on done... because we are running these using promises, the commands complete before each then is complete.

    // Do things async. This is to prove that promises work as expected along side streams.
    actionChannel.sync(false);
    actionChannel.closeOnDone(false); // Turn off closeOnDone because the timeouts set to allow the mikrotik to reflect the changes takes too long. The channel would close.

    // These will run synchronsously (even though sync is not set to true)
    console.log("Disabling interface");
    actionChannel.write('/interface/set',{'disabled':'yes','.id':'ether1'}).then(results=>{
        console.log("Disable complete.");
        // when the first item comes in from the listen channel, it should send the next command.
        const {promise,resolve,reject}=MikroNode.getUnwrappedPromise();
        listenChannel.data
            .take(1)
            // This is just to prove that it grabbed the first one.
            .do(d=>console.log("Data:",MikroNode.resultsToObj(d.data)))
            .subscribe(d=>actionChannel.write('/interface/set',{'disabled':'no','.id':'ether1'}).then(resolve,reject));
        return promise;
    })
    .then(results=>{
        console.log("Enabled complete.");
        // return new Promise((r,x)=>setTimeout(r,1000)).then(()=>actionChannel.write('/interface/getall'));
        const {promise,resolve,reject}=MikroNode.getUnwrappedPromise();
        // when the second item comes in from the listen channel, it should send the next command.
        listenChannel.data
            .take(1)
            // This is just to prove that it grabbed the second one.
            .do(d=>console.log("Data:",MikroNode.resultsToObj(d.data)))
            .subscribe(d=>actionChannel.write('/interface/getall').then(resolve,reject));
        return promise;
    })
    .then(results=>{
        var formatted=MikroNode.resultsToObj(results.data);
        var columns=[".id","name","mac-address","comment"];
        var filtered=formatted.map(line=>columns.reduce((p,c)=>{p[c]=line[c];return p},{}));
        console.log('Interface [ID,Name,MAC-Address]: ',JSON.stringify(filtered,true,4));
    })
    .catch(error=>{
        console.log("An error occurred during one of the above commands: ",error);
    })
    // This runs after all commands above, or if an error occurs.
    .then(nodata=>{
        console.log("Closing everything.");
        listenChannel.close(true); // This should call the /cancel command to stop the listen.
        actionChannel.close();
    });
}).catch(e=>console.log("Error connecting: ",e));
