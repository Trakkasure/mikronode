var api=require('../dist/mikronode.js');

var device=new api(/* Host */'10.10.10.10' /*, Port */ /*, Timeout */);
// device.setDebug(api.DEBUG);

// connect: user, password.
device.connect()
.then(([login])=>login('username','password'))
.then(function(conn) {
    var c1=conn.openChannel();
    var c2=conn.openChannel();
    c1.closeOnDone(true);
    c2.closeOnDone(true);

    console.log('Getting Interfaces');
    c1.write('/interface/ethernet/print');
    console.log('Getting routes');
    c2.write('/ip/route/print');

    c1.data // get only data here
      .subscribe(function(data) { // feeds in one result line at a time.
          console.log('Interfaces:');
          console.log(JSON.stringify(data.data,true,2));
       })

    // In this one, we wait for the data to be done before running handler.
    c2.done // return here only when all data is received.
      .subscribe(function(data){ // feeds in all results at once.
        console.log('Routes:');
        // data.forEach(function(i){console.log(JSON.stringify(i,4,true))});
        console.log(JSON.stringify(data.data,true,2));
      });

})
.catch(function(err) {
  console.log("Error during processing:",err);
});
