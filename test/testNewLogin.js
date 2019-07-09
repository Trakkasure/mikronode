
var api=require('../dist/mikronode.js');

var device=new api(/* Host */'127.0.0.1' /*, Port */ /*, Timeout */);
// device.setDebug(api.DEBUG);

// connect:
device.connect().then(([login])=>login('username','password')).then(function(conn) {
    console.log("Logged in");
},function(err) {
  console.log("Error connecting:",err);
});
