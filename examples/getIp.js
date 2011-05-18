var api = require('../lib/index.js');
     
var connection = new api('192.168.0.1','admin','password');
connection.connect(function(conn) {

   var chan=conn.openChannel();

   chan.write('/ip/address/print',function() {
      chan.on('done',function(data) {

         var parsed = api.parseItems(data);

         parsed.forEach(function(item) {
            console.log('Interface/IP: '+item.interface+"/"+item.address);
         });
 
         chan.close();
         conn.close();

      }); 
   }); 
}); 

