# Mikronode
      
  Full-Featured asynchronous Mikrotik API interface for [NodeJS](http://nodejs.org).
  
     var api = require('mikronode');
     
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
  * Cleanup login section in connect method.
  * Re-design code to hide internal methods and variables.
  * Write tests con make sure everything keeps working while making above changes.

## API

### Connection

  Calling new api(host,user,pass) returns a connection object.

  * conn.connect(callback)
      > Connect to the target device. The callback function is called after successful login with the current connection object as its parameter.
  * conn.openChannel(id)
      > Open and return a new channel object. Each channel is a unique command line to the mikrotik, allowing simultaneous execution of commands. The ID parameter is optional.
  * conn.isConnected()
      > Returns true is currently connected to a mikrotik device.
  * conn.closeChannel(id)
      > Closes an open channel. This will call the close method of the channel object.
  * conn closeOnDone(b)
      > If b == true, when a done event occurs, close the connection after all channels have been closed.
  * conn.close(force)
      > Close the connection. If force is true, force close of any open channels then close this connection.

### Channel

  The following methods are available for channels:

  * channel.closeOnDone(b)
  * channel.setSaveBuffer(b)
      > If b is true, then save each line received in a buffer and pass the entire buffer to the done event. Otherwise the done event will not get all the lines, only the last line.  
      > This is handy when following trailing output from a listen command, where the data could be endless.
  * channel.getConnection()
  * channel.getId()
  * channel.write(lines,writeCallback)
      > Lines can be a string, or an array of strings. If it is a string, then it is split on the EOL character and each resulting line is sent as a separate word (in API speak)
        If lines is an array, then each element is sent unaltered.
  * channel.close(force)
      > Close the channel. If there are any commands still waiting to be executed, they will be completed before closing the channel.
        If force is TRUE, then the channel is immediately closed. If the channel is running, the cancel command is sent to stop any running listen commands, or potentially long running output.

## Examples

### Connect to a Mikrotik, and add an address to ether1

     var api = require('mikronode');

     var connection = new api('192.168.0.1','admin','password');
     connection.connect(function(conn) {

        var chan=conn.openChannel();

        chan.write(['/ip/address/add','=interface=ether1','=address=192.168.1.1'],function() {
           chan.on('trap',function(data) {
              console.log('Error setting IP: '+data);
           });
           chan.on('done',function(data) {
              console.log('IP Set.');
           });
           chan.close();
           conn.close();
        });
     });

### Writing the program for the example API conversation on the [Mikrotik Wiki](http://wiki.mikrotik.com/wiki/API#.2Fcancel.2C_simultaneous_commands)

     var api = require('mikronode');

     var connection = new api('192.168.0.1','admin','password');
     connection.connect(function(conn) {

        conn.closeOnDone(true);
        var chan2=conn.openChannel(2);
        chan2.write('/interface/listen',function(chan) {
           chan.on('read',function(data) {
              packet=api.parseItems([data])[0];
              console.log('Interface change: '+JSON.stringify(packet));
           });
        });

        var chan3=conn.openChannel(3);
        chan3.closeOnDone(true);

        chan3.write(['/interface/set','=disabled=yes','=.id=ether1'],function(chan) {
           chan.on('done',function(d,chan) {
              // We do this here, 'cause we want channel 4 to write after channel 3 is done.
              var chan4=conn.openChannel(4); // We'll use this later.
              chan4.closeOnDone(true);
              chan4.write(['/interface/set','=disabled=no','=.id=ether1'],function() {
                var chan5=conn.openChannel(5); 
                chan5.closeOnDone(true);
                chan5.write('/interface/getall',function(chan) {
                   chan.on('done',function(data) {
                      packets=api.parseItems(data);
                      packets.forEach(function(packet) {
                          console.log('Interface: '+JSON.stringify(packet));
                      });
                      chan2.close(); // This should call the /cancel command to stop the listen.
                   });
                });
              })
           });
        });
     });

### Simplifying the above by reducing the number of channels.
  Notice how the callback embedding is not needed using the syncronous capability.

     var api = require('mikronode');

     var connection = new api('192.168.0.1','admin','password');
     connection.connect(function(conn) {

        conn.closeOnDone(true); // All channels need to complete before the connection will close.
        var listenChannel=conn.openChannel();
        listenChannel.write('/interface/listen',function(chan) {
           chan.on('read',function(data) {
              packet=api.parseItems([data])[0];
              console.log('Interface change: '+JSON.stringify(packet));
           });
        });

        var actionChannel=conn.openChannel();
        // These will run synchronsously
        actionChannel.write(['/interface/set','=disabled=yes','=.id=ether1']); // don't care to do anything after it's done.
        actionChannel.write(['/interface/set','=disabled=no','=.id=ether1']); // don't care to do anything after it's done.
        actionChannel.write('/interface/getall',function(chan) {
           chan.on('done',function(data) {
              packets=api.parseItems(data);
              packets.forEach(function(packet) {
                  console.log('Interface: '+JSON.stringify(packet));
              });
              listenChannel.close(); // This should call the /cancel command to stop the listen.
           });
        });
        actionChannel.close(); // The above commands will complete before this is closed.
     });


## Associatoins & Affiliations
  **Mikronode** is in no way associated or affiliated with MikroTik in any way. This code was written in a clean room environment.
  The method *decodeLength* and *encodeString* were written based on code [here on the Mikrotik Wiki](http://wiki.mikrotik.com/wiki/API_PHP_class#Class).
  
## License

(The MIT License)

Copyright (c) 2011 Brandon Myers <trakkasure@gmail.com>

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

