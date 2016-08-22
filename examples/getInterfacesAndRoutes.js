var api=require('..');

var device=new api(/* Host */'10.10.10.1' /*, Port */ /*, Timeout */);


// connect: user, password.
device.connect('username','password').then(function(conn) {
    conn.closeOnDone(true);
    var c1=conn.openChannel();
    var c2=conn.openChannel();
    c1.closeOnDone(true);
    c2.closeOnDone(true);
    console.log('Getting Interfaces');
    c1.write('/interface/print');
    console.log('Getting routes');
    c2.write('/ip/route/print');

    c1.data // filter is pointless since data is only data.filter(function(d) {return d.type=='data'})
      .subscribe(function(data) { // feeds in one result line at a time.
          console.log(JSON.stringify(data));
       })
    });

    // In this one, we wait for the data to be done before running handler.
    c2.bufferedStream
      .subscribe(function(data){ // feeds in all results at once.
        console.log('Routes:');
        data.forEach(function(i){console.log(JSON.stringify(i))});
      });
};
