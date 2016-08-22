var api = require('../lib/index.js');
     
var connection = new api('192.168.0.1','admin','');
connection.connect(function(conn) {

   var chan=conn.openChannel();
   conn.closeOnDone(true);
   chan.write('/ip/address/print',function() {
      chan.closeOnDone(true);
      chan.on('done',function(data) {

         var parsed = api.parseItems(data);

         parsed.forEach(function(item) {
            console.log('Interface/IP: '+item.interface+"/"+item.address);
         });
 
      }); 
   }); 
}); 

