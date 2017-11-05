# Mikronode
      
  Full-Featured asynchronous Mikrotik API interface for [NodeJS](http://nodejs.org).
 ```javscript 
     var MikroNode = require('mikronode');
     
     var device = new MikroNode('192.168.0.1');

     device.connect()
       .then(([login])=>{
         return login('username','password');
       })
       .then(function(conn) {

         var chan=conn.openChannel("addresses"); // open a named channel
         var chan2=conn.openChannel("firewall_connections",true); // open a named channel, turn on "closeOnDone"

         chan.write('/ip/address/print');

         chan.on('done',function(data) {
 
              // data is all of the sentences in an array.
              data.forEach(function(item) {
                 console.log('Interface/IP: '+item.data.interface+"/"+item.data.address);
              });

              chan.close(); // close the channel. It is not autoclosed by default.
              conn.close(); // when closing connection, the socket is closed and program ends.

         });

         chan.write('/ip/firewall/print');

         chan.done.subscribe(function(data){

              // data is all of the sentences in an array.
              data.forEach(function(item) {
                 var data = MikroNode.resultsToObj(item.data); // convert array of field items to object.
                 console.log('Interface/IP: '+data.interface+"/"+data.address);
              });

         });

     });
```
## Installation

  Clone this repository into your node_modules directory.
  - or -
     $ npm install mikronode


## Features

  * Channel based communication
  * Multiple channels can be used at once.
  * Synchronous execution of commands issued on the same channel.
  * Asynchrounous execution of commands issued on different channels.
  * Focus on high performance

## TODO
  * Write tests con make sure everything keeps working whenever making changes.

## API
        // There are 2 ways to get resulting data from channels:
        // Using events, like earlier versions:
        //   data takes each sentence one at a time.
        //   done takes an entire result from last command.
        // Using Streams channel and connection provides access to several layers of them.
        //   Channels filter only data for that channel
        //      data: sentences that are data.
        //      trap: stream of traps. Useful for reading data streams using takeUntil(trapStream). Or for piping to notification on UI.
        //      bufferedSteam: when data response is "done" the buffered stream emits packets. Don't use this with a "listen" command.
        //      read: every sentence passes through this one.
        //   Connections also have streams, where they do not filter per channel:
        //      raw: The raw socket data. This emits buffers.
        //      sentence:each raw sentence is emitted from this stream
        //      read: the parsed sentences this is similar to the Channel read stream except does not filter by channel id.
        //      trap: all traps

### Connection

  Calling new MikroNode(host[,port,socketTimeout]) returns an object representing the device.
```javascript
    var MikroNode = require('mikronode');
    var Device =new MikroNode(host,port);
    Device.connect().then(([login])=>login('admin','password')).then(function(conn) { 
        var chan=conn.openChannel();
    });
```
With the above code, the following is API description. conn is Connection object, chan is Channel object.
  * MikroNode.resultsToObj(dataObj) <Object|Array>
      Convert the sentence format of the mikrotik into a more easily readable
  * Device.connect([cb]) <Promise>
      Connect to the target device. The optional callback function is called after successful connect with the function to call to login as the 2nd parameter, and any connection errors as the first.
      the connect method returns a Promise that is resolved when connecting.
  * Device.socketOpts (write-only property)
      Optionally allows the setting of parameters that the socket connecting to the mikrotik will use.
  * Device.TLS(tlsOpts)
      Enable TLS and set it's options. Take note that you will need to be sure the port the API is trying to connect is an SSL/TLS port. For unauthenticated SSL connections (no signed certs) only ADH cipher is supported. This is a limitation of the RouterOS software
  * Device.setDebug(level)
      Set the default debug logging level for the device, and all subsequent created connections.
  * conn.openChannel(id|name)  <Channel>
      Open and return a new channel object. Each channel is a unique command line to the mikrotik, allowing simultaneous execution of commands. The ID parameter is optional. If not specified, the current timestamp is used. If too many channels are opened at one time without specifying a name, there could be duplicate names.  * conn.connected()
      Returns true is currently connected to a mikrotik device.
  * conn.closeChannel(id)  
      Closes an open channel. This will call the close method of the channel object.
  * conn closeOnDone(b)  
      If b == true, when a done event occurs, close the connection after all channels have been closed.
  * conn.close(force)  
      Close the connection. If force is true, force close of any open channels then close this connection.
  * conn.getHost()
  * conn.getUser()


### Channel

  The following property/methods are available for channels:

  * channel.done <Observable>
      "done" is the stream that contains events when the done sentence comes from the device.
      When subscribing, the stream's data contans an object with each line received in an array.
  * channel.data <Observable>
      For each sentence received, this has an observable event. Only sentences designated for this channel will pass through this sentence.
      This is handy when following trailing output from a listen command, where the data could be endless.
  * channel.trap <Observable>
      Any traps that occur on a channel can be captured in this observable stream.
  * chanenl.sync(b)
      If b == true, each command is run synchronously. Otherwise commands are executed as they are passed.
  * channel.closeOnDone(b)
      If b == true, when a done event occurs, close the channel after all commands queued have been executed.
  * channel.getId()
  * channel.write(lines[,optionsObject]) <Promise>
      Returns a promise that is resolved when the command sent is complete and is "done"
      The promise is rejected if a trap or fatal error occurs.
      Lines can be a string, or an array of strings. If it is a string, then it is split on the EOL character and each resulting line is sent as a separate word (in API speak)
      If lines is an array, then each element is sent unaltered.
      If lines is a string and optionsObject is provided, the optionsObject is converted to standard sentence output: =propertyName=propertyValue
  * channel.close(force)
      Close the channel. If there are any commands still waiting to be executed, they will be completed before closing the channel.  
      If force is TRUE, then the channel is immediately closed. If the channel is running, the cancel command is sent to stop any running listen commands, or potentially long running output.

## Examples

### Connect to a Mikrotik, and add an address to ether1
```javascript
     var api = require('mikronode');

     var device = new api('192.168.0.1');
     device.connect().then(([login])=>login('admin','password')).then(function(conn) {

        var chan=conn.openChannel();

        chan.write('/ip/address/add',{'interface':'ether1','address':'192.168.1.1'});
        chan.on('trap',function(data) {
            console.log('Error setting IP: '+data);
        });
        chan.on('done',function(data) {
            console.log('IP Set.');
        });
        chan.close();
        conn.close();
     });
```
### Writing the program for the example API conversation on the [Mikrotik Wiki](http://wiki.mikrotik.com/wiki/API#.2Fcancel.2C_simultaneous_commands)
```javascript
     var MikroNode = require('mikronode');

     var device = new MikroNode('192.168.0.1');
     device.connect().then(([login])=>login('admin','password')).then(function(conn) {
        conn.closeOnDone(true); // when all channels are "done" the connection should close.

        var chan1=conn.openChannel("interface_listener");
        chan1.write('/interface/listen');
        chan1.data.subscribe(function(item) {
            var packet=MikroNode.resultsToObj(item.data);
            console.log('Interface change: '+JSON.stringify(packet));
        });

        // This should be called when the cancel is called below. (trap occurs first, then done)
        chan1.done.subscribe(function(packet) {
            // This should output everything that the above outputted.
            packet.data.forEach(function(data) {
                var packets=MikroNode.resultsToObj(data);
                console.log('Interface: '+JSON.stringify(packet));
            });
        });

        var chan2=conn.openChannel('config_interface');

        // added closeOnDone option to this call
        var chan3=conn.openChannel('enable_interface'); // We'll use this later.

        var chan4=conn.openChannel('getall_interfaces'); 

        chan2.write('/interface/set',{'disabled':'yes','.id':'ether1'});
        chan2.done.subscribe(function(items) {
            // We do this here, 'cause we want channel 4 to write after channel 3 is done.
            // No need to listen for channel3 to complete if we don't care.
            chan3.write('/interface/set',{'disabled':'no','.id':'ether1'});

            chan4.write('/interface/getall');

            // Alternative (legacy) way of caturing when chan4 is done.
            chan4.on('done',function(packet) {
                packet.data.forEach(function(data) {
                    var packets=MikroNode.resultsToObj(data);
                    console.log('Interface: '+JSON.stringify(packet));
                });
                chan1.close(); // This should call the /cancel command to stop the listen.
            });
        });
    });
```
### Simplifying the above by reducing the number of channels.
  Notice how the callback embedding is not needed using the syncronous capability.
```javascript
    var MikroNode = require('mikronode');

    var device = new MikroNode('192.168.0.1');
     device.connect().then(([login])=>login('admin','password')).then(function(conn) {
        conn.closeOnDone(true); // All channels need to complete before the connection will close.
        var listenChannel=conn.openChannel();
        listenChannel.write('/interface/listen');

        // Each sentence that comes from the device goes through this.
        listenChannel.read.subscribe(function(data) {
            var packet=MikroNode.resultsToObj(data);
            console.log('Interface change: '+JSON.stringify(packet));
        });

        var actionChannel=conn.openChannel();
        actionChannel.sync(true);

        // These will run synchronsously
        actionChannel.write('/interface/set',{'disabled':'yes','.id':'ether1'});
        actionChannel.write('/interface/set',{'disabled':'no','.id':'ether1'});
        actionChannel.write('/interface/getall');
        actionChannel.on('done',function(packet) {
            packet.data.forEach(function(data) {
                var packets=MikroNode.resultsToObj(data);
                console.log('Interface: '+JSON.stringify(packet));
            });
            listenChannel.close(); // This should call the /cancel command to stop the listen.
        });
        actionChannel.close(); // The above commands will complete before this is closed.
    });
```
### Promises add simplicity:
```javascript
    var MikroNode = require('mikronode');
    var device = new MikroNode('192.168.0.1');
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
    });
```

### The methods *decodeLength* and *encodeString* were written based on code [here on the Mikrotik Wiki](http://wiki.mikrotik.com/wiki/API_PHP_class#Class).
  
## License

(The MIT License)

Copyright (c) 2011,2012,2013,2014,2015,2016,2017 Brandon Myers <trakkasure@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

