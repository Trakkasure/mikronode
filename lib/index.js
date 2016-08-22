var Socket=require('net').Socket;
var events=require('events');
var crypto=require('crypto');
//var futures=require('futures');
var util=require('util');
var emptyString=String.fromCharCode(0);
var parser=require('../src/parser');
var api;
(function(){

/*
 * Instance methods of the connection object (returned after calling new)
 */

/* thanks to Håkon Nessjøen of Avelia AS for the Action Script version where this function is 100% derived. */
function encodeString(s) {
    var data = null;
    var len = Buffer.byteLength(s);
    var offset=0;

    if (len < 0x80) {
            data=new Buffer(len+1);
            data[offset++]=len;
    } else 
    if (len < 0x4000) {
            data=new Buffer(len+2);
            len |= 0x8000;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else
    if (len < 0x200000) {
            data=new Buffer(len+3);
            len |= 0xC00000;
            data[offset++]=(len >> 16) & 0xff;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else
    if (len < 0x10000000) {
            data=new Buffer(len+4);
            len |= 0xE0000000;
            data[offset++]=(len >> 24) & 0xff;
            data[offset++]=(len >> 16) & 0xff;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else {
        data=new Buffer(len+5);
        data[offset++]=0xF0;
        data[offset++]=(len >> 24) & 0xff;
        data[offset++]=(len >> 16) & 0xff;
        data[offset++]=(len >> 8) & 0xff;
        data[offset++]=len & 0xff;
    }
    data.utf8Write(s,offset);
    return data;
}

function decodeLength(data){ // Ported from the PHP API on the Wiki. Thanks
var idx=0;
var b=data[idx++];
if (b&128) {
    if ((b&192)==128) {
        len=((b&63)<<8)+data[idx++];
    } else {
        if ((b & 224) == 192) {
            len = ((b & 31) << 8 ) + data[idx++];
            len = (len << 8 ) + data[idx++];
        } else {
            if ((b & 240) == 224) {
                len = ((b & 15) << 8 ) + data[idx++];
                len = (len << 8 ) + data[idx++];
                len = (len << 8 ) + data[idx++];
            } else {
                len = data[idx++];
                len = (len << 8 ) + data[idx++];
                len = (len << 8 ) + data[idx++];
                len = (len << 8 ) + data[idx++];
            }
        }
        }
    } else {
        len=b;
    }
    return [idx,len];
}
//hexDump=require('./hexdump');
function hexDump(data) {
    var hex=[]
    var cref=[];
    var i=0;
    for (var j=0;j<data.length;j++) {
        i=j%8;
        //m=ctrl.indexOf(data[j]);
        if (data[j]<20||data[j]>126) cref[i]='.';
        else cref[i]=String.fromCharCode(data[j])
        hex[i]=Number(data[j]).toString(16);
        while (hex[i].length < 2) hex[i] = "0" + hex[i];
        if (hex.length==8) {
            console.log("%d: %s    %s",j-7,hex.join(' '),cref.join('') );
            hex=[];
            cref=[];
        }
    }
    if (i!=8) {
        console.log(hex.join(' ')+'    '+ cref.join('') )
        hex=[];
        cref=[];
    }
}
/* */
function MikroNode(host,user,password,options) {
    return new api(host,user,password,options);
}


api=function (host,user,password,options) {
    this.hash=crypto.createHash('md5').update(host+user).digest('hex');
    //  If we already have a connection, return the same one.
    if (!options) options={};
    if (api._conn[this.hash]) return api._conn[this.hash].handler;
    this.host=host;
    this.user=user;
    this.password=password;
    this.debug=options.debug||0;
    this.port=options.port||8728;
        this.timeout=options.timeout||5;
    this.socket=null; //socket connection
    this.connected=false; // If we are connected.
    this.connecting=false; // If we are trying to connect.
    this.line=''; // current line. When the line is built, the sentence event is called.
    this.buffer=[]; // buffer holding incoming stream from socket
    this.packet=[]; // current packet
    this.channel={}; // all channels in use
    this.trap=false; // we encountered a trap.
    this.error={}; //Buffer errors
    this.closeOnDone=false; // when !done event is called, close the connection.
    this.closeOnFatal=true; // when !fatal occurs, close the connection.
    this.datalen=0; // Used to look-ahead to see if more data is available after !done is received.
    api._conn[this.hash]=this;
    return this.handler=new Connection(this);
}
util.inherits(api,events.EventEmitter);
api.prototype.sentence=function(data) {
    if (this.debug>2) 
        util.debug('Sentence: '+JSON.stringify(data));
    switch(data.type) {
        case 'tag':
            this.channel[data.id].data(data.data);
            break;
        case 'done_tag':
        case 'done_ret_tag':
            this.channel[data.id].done(data.data);
            break
        case 'done':
        case 'done_ret':
            this.handler.emit('done',data.data);
            break;
        case 'trap':
        case 'trap_tag':
            if (data.id)
                this.channel[data.id].emit('trap',data.data,this.channel[data.id]);
            else this.handler.emit('trap',data.data,this.handler);
            break;
        case 'fatal':
        case 'fatal_tag':
            if (data.id)
                this.channel[data.id].emit('fatal',data.data,this.channel[data.id]);
            else this.handler.emit('fatal',data.data,this);
            if (!this.closing && this.closeOnFatal) this.handler.close(true);
            break;
    }
}
api.prototype.read=function(data) { // This is the handler for when the socket receives data. Don't call instance function directly
    var self=this;
    var hex;
    if (!self['b']) 
        self.b=[];
    //hex=new hexDump(16)
    //hex.write(data);
    while(data.length) {
        if (self.debug>3) 
            util.debug('read: data-len:'+data.length);
        if (self.len) { // maintain the current data length. What if the data comes in 2 separate packets?
                        // I am hopping that the API on the other end doesn't send more than one channel
                        // at a time if more than one packet is required.
            //if (self.debug>3) util.debug('read: data:'+data);
            if (data.length<=self.len) {
                self.len-=data.length;
                self.line+=data.toString();
                if (self.debug>3) 
                    util.debug('read:consume-all: data:'+data);
                if (self.len==0) {
                    //self.emit('sentence',self.line,(data.length!=self.len))
                    self.b.push(self.line);
                    self.line='';
                }
                break;
            } else {
                if (self.debug>3) util.debug('read:consume len:('+self.len+') data: '+data);
                self.line+=data.toString('utf8',0,self.len);
                var l=self.line;
                self.line='';
                data=data.slice(self.len);
                var x=decodeLength(data);
                self.len=x[1];
                data=data.slice(x[0]); // get rid of excess buffer
                if (self.len==1&&data[0]=="\x00") {
                    self.len=0;
                    data=data.slice(1); // get rid of excess buffer
                }
                self.b.push(l);
            }
        } else {
            var x=decodeLength(data);
            self.len=x[1];
            data=data.slice(x[0]);
            if (self.len==1&&data[0]=="\x00") {
                self.len=0;
                data=data.slice(1); // get rid of excess buffer
            }
        }
    }
    if (self.b.length && !self.len) {
        //util.log(hex.parse().dump());
        //console.log("Parsing: "+self.b.join("\n"))
        //console.log("Parsing: "+JSON.stringify(self.b));
        v=parser.parse(self.b.join("\n"));
        self.b=[];
        v.forEach(function(i) { self.emit('sentence',i) });
    }
}
api.prototype.write=function(a) { // This shouldn't be called directly. Please use channels.
    if (!this.socket||(!this.connected&&!this.connecting)) {
        if (this.debug>2)
             util.debug('write: not connected ');
        return;
    }
    if (typeof(a)==='string') a=[a];
    else if (!Array.isArray(a)) return;
    var self=this;
    a.forEach(function(i){
        try {
        if (self.debug>2)
             util.debug('write: sending '+i);
        self.socket.write(encodeString(i));
        } catch(error) {
            self.emit("error",error)
        }
    });
    this.socket.write(emptyString);
}
api.prototype.connect=function(connectHandler) {
    // While logging in, if an error occurs, we should kill the socket. This will keep node from not terminating due to lingering sockets.
    this.socket=new Socket({type:'tcp4'});
    if (this.debug>3) util.debug('Connecting to '+this.host);
    this.connecting=true;
    var self=this;
    this.socket.on('data',function(a){self.read(a)});
    this.socket.on('end',function(a){
        if (self.connected)
            self.handler.close(true);
    });
    this.socket.on('error',function(a){
        if (self.debug>1)
            util.log('Connection error: '+a);
        self.handler.emit('error',a,this.handler)
        self.handler.close(true);
        /*
        self.socket.destroy();
        self.connected=false;
        self.handler.emit('close',this.handler);
        self.handler.removeAllListeners();
        self.removeAllListeners();
        */
    });
    // This will be called if there is no activity to the server.
    // If this occurs before the login is successful, it could be
    // that it is a connection timeout.
    this.socket.setTimeout(this.timeout*1000,function(e) { // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
        if (self.debug) 
            util.debug('Socket Timeout');
        if (!self.connected)
            self.emit('error','Timeout Connecting to host',self);
    });
    this.socket.connect(this.port,this.host,connectHandler);
    this.socket.setKeepAlive(true); 
}
//api.closeEvent()

function Connection(instance) {
    var o={
    status: "New",
    debug: instance.debug,
    closeOnDone: function(b) { 
        if (typeof(b)==='boolean') instance.closeOnDone=b;
        return instance.closeOnDone;
    },
    closeOnFatal: function(b) { 
        if (typeof(b)==='boolean')
		    if (!instance.closeOnFatal&&b) instance.closeOnFatal=b?self.addListener('fatal',function(conn){instance.close()}):false;
            else if (!!instance.closeOnFatal) self.removeListener('fatal',instance.closeOnFatal);
        return !!instance.closeOnFatal;
    },
    connected: function(b) { 
        if (typeof(b)==='boolean') instance.connected=b;
        return instance.connected;
    },
    getHost: function() { return instance.host;},
    getUser: function() { return instance.user;},
    setHost: function(h) { if (instance.connected) return this;this.host=h; return this},
    connect:function(callBack) {
        if (instance.connected) return;
        if (!api._conn[instance.hash]) throw new Error('Connection is dead. Cannot use.');
        this.connectionCallback=callBack;
        var self=this; // this is the local object.
        this.status="Connecting";
        loginHandler=function(d) {
            if (instance.debug>2)
                util.debug('LoginHandler: '+self.status+' : '+self.getHost());
            util.debug('LoginHandler: '+JSON.stringify(d));
            // Initial connect
            if (!d) return instance.write('/login');
            switch(d.type) {
                case 'done_ret':
                    var a=d.id.split('');
                    var challenge="";
                    while(a.length) challenge+=String.fromCharCode(parseInt("0x"+a.shift()+a.shift()));
                    if (challenge.length!=16) {
                        self.status='Error';
                        if (instance.debug>2) util.debug(self.status);
                        instance.error='Bad connection response: '+d;
                        if (instance.debug>3) util.debug('Challenge length:'+challenge.length);
                        if (instance.debug) util.debug(instance.error);
                        instance.removeListener('sentence',loginHandler);
                        instance.close();
                    } else {
                        console.log((instance.password+challenge).length);
                        instance.write([
                                "/login",
                                "=name="+instance.user,
                                "=response=00"+crypto.createHash('md5').update(emptyString+instance.password+challenge).digest("hex")
                            ]
                        );
                    }
                    break;
                case 'trap':
                    self.trap={"TRAP":"Logging in"};
                    self.emit('trap',d.data);
                    self.trap=false;
                    this.status="Connecting";
                    return;
                    break;
                case 'done':
                    self.status='Connected';
                    util.debug('Logged in');
                    instance.removeAllListeners('sentence');
                    self.removeAllListeners('fatal');
                    self.removeAllListeners('trap');
                    instance.addListener('sentence',function(data){instance.sentence(data)});
                    if (instance.debug>2)
                        util.debug(self.status);
                    instance.connected=true;
                    if (self.connectionCallback) {
                        self.connectionCallback(self);
                        self.connectionCallback=null;
                    }
                    break;
            }
        }
        instance.addListener('sentence',loginHandler);
        instance.addListener('error',function(e){self.emit('error',e,self)});
        //this.addListener('fatal',function(conn){self.close()});
        //instance.addListener('trap',function(conn){self.close()});
        instance.connect(loginHandler);
        // While logging in, if an error occurs, we should kill the socket. This will keep node from not terminating due to lingering sockets.
        return this;
    },
    openChannel:function(id) {
        if (!id) {
            id=Object.keys(instance.channel).length+1;
            while (instance.channel[id]) id++;
        } else
        if (instance.channel[id]) throw('Channel already exists for ID '+id);
        if (instance.debug>0) 
            util.debug('Opening channel: '+id);
        var o=instance.channel[id]=new apiChannel(id,this);
        var self=this;
        o.addListener('close',function(){if ((instance.closing||instance.closeOnDone)&&Object.keys(instance.channel).length) self.close();});
        return o;
    },
    getChannel:function(id) {
        if (!id && id!==0)
            throw('Missing channel ID parameter'+id);
        if (!instance.channel[id]) throw('Channel does not exist '+id);
        if (instance.debug>0) 
            util.debug('Getting channel: '+id);
        return instance.channel[id];
    },
    write: function(a){return instance.write(a)},
    closeChannel:function(id) {
        if (!id) throw("Missing ID for stream channel to close.");
        if (!instance.channel[id]) throw('Channel does not exist for ID '+id);
        // Make sure that the channel closes itself... so that remaining commands will execute.
        if (!instance.channel[id].closed()) return instance.channel[id].close();
        if (instance.debug>0) 
            util.debug('Closing '+this.getHost()+' channel: '+id);
        delete instance.channel[id];
        if (Object.keys(instance.channel).length==0 && (instance.closing || instance.closeOnDone)) this.close();
    },
    close:function(force) {
        if (!this.connected()) { // If we're not connected
            if (instance.debug>0) 
                util.log('Connection disconnected: '+this.getHost());
            if (instance.socket) {
                instance.socket.destroy(); // destroy the socket
                instance.socket=null;
            }
            instance.connected=false;
            delete api._conn[instance.hash];
            instance.removeAllListeners();
            Object.keys(instance.channel).forEach(function(c) {
                c.close(true);
                c.removeAllListeners()
            });
            console.log(instance.channel);
            this.emit('close',self);
            this.removeAllListeners();
            return;
        }
        if (!force&&Object.keys(instance.channel).length>0) {
            instance.closing=true;
            if (instance.debug>1) console.log('deferring closing connection');
            return;
        }
        if (instance.debug>0) 
            util.log('Connection disconnecting: '+this.getHost());
        instance.removeAllListeners('done');
        var self=this;
        if (force) Object.keys(instance.channel).forEach(function(e){instance.channel[e].close(true);});
        this.once('fatal',function(p,c){ // quit command ends with a fatal.
            if (instance.debug>0) 
                util.log('Connection disconnected: '+this.getHost());
            //if (self.connected()) self.close(true);
            /*
            instance.socket.destroy();
            instance.connected=false;
            instance.removeAllListeners();
            self.emit('close',self);
            self.removeAllListeners();
            */
        });
        instance.closing=false;
        delete api._conn[instance.hash];
        if (instance.socket&&instance.connected) instance.write(['/quit']);
        instance.connected=false;
        self.emit('close',self);
        instance.connecting=true;
        instance.connecting=false;
        instance.closing=true;
    },
    finalize:function() {
        this.close(true);
    }
    };
    c=this;
    Object.keys(o).forEach(function(k){c[k]=o[k]});
}
util.inherits(Connection,events.EventEmitter);
api._conn={};
/**
 * Parse !re return records into an array of objects
 */
MikroNode.parseItems=function(data) {
    var db=[];
    var idx=0;
    var record={};
    util.puts('parseItems: '+JSON.stringify(data));
    data.forEach(function(data){
        if (Array.isArray(data)) {
            record={};
            while(data.length) {
                d=data.shift();
                record[d.field]=d.value;
            }
            db.push(record);
        } else {
            util.debug(data);
            record[data.field]=data.value;
            db.push(record);
        }
        //if (data.length==1&&data[0]!=record) db.push(record);
    });
    util.debug(db);
    return db;
}

module.exports=MikroNode;


/*
 * This is the channel definition.
 */
function apiChannel(id,conn) {
    this.id=id;
    this.conn=conn;
    this.saveBuffer=true;
    this.closeOnDone=false;
    this.writeCallback=null;
    this.packet=[];
    this.running=false;
    this.closing=false;
    this.closedg=false;
    this.commands=[];
    this.clearEvents=true;
    return this.handler=new Channel(this);
}
util.inherits(Channel,events.EventEmitter);
function Channel(instance) {
    this.buffer=[];
    var o={
        getId:function(){return instance.id},
        saveBuffer: function(b) { // Sets wether to buffer content for final call or not.
            if (typeof(b)==='boolean') instance.saveBuffer=b;
            return instance.saveBuffer;
        },
        getConnection:function(){return instance.conn;},
        running: function(b) { 
            if (typeof(b)==='boolean') instance.running=b;
            return instance.running;
        },
        closing: function(b) { 
            if (typeof(b)==='boolean') instance.closing=b;
            return instance.closing;
        },
        closed: function(b) { 
            if (typeof(b)==='boolean') instance.closed=b;
            return instance.closed;
        },
        closeOnDone: function(b) { return typeof(b)=='boolean'?instance.closeOnDone=b:instance.closeOnDone; },
        clearEvents: function(b) { return typeof(b)=='boolean'?instance.clearEvents=b:instance.clearEvents; },
        write:function(d,writeCallback) {
            if (this.closing()) return;
            if (d) {
                if (typeof(d)=='string')
                    d=d.split("\n");
                if (Array.isArray(d)&&d.length)
                    this.buffer=this.buffer.concat(d);
                else return;
            } else {
                if (this.getConnection().debug>0) util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') write: empty arg.');
            }
            if (this.running()) {
                if (this.getConnection().debug>0) util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') write: pushing command.');
                instance.commands.push([this.buffer,writeCallback]);
                this.buffer=[];
            } else {
                var b=this.buffer;
                this.running(true);
                this.saveBuffer(true);
                this.buffer=[];
                b.push('.tag='+this.getId());
                this.callback=writeCallback;
                if (this.callback)
                    this.callback(this); // allow setup before sending command.
                this.callback=null;
                if (this.getConnection().debug>0) util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') write lines: '+JSON.stringify(b));
                this.getConnection().write(b); // Send command.
            }
            return this;
        },
        done: function(data) { // Don't call instance directly. This is called when the data stream is complete for instance channel.
            if (this.getConnection().debug>0)
                util.debug('Channel done: ('+this.getConnection().getHost()+":"+this.getId()+')');
            var p=instance.packet;
            instance.packet=[];
            if(!p.length) p=[data];
            else if(p[p.length-1]!=data) p.push(data);
            this.emit('done',p,this);
            if (this.clearEvents()) {
                this.removeAllListeners('done');
                this.removeAllListeners('data');
                this.removeAllListeners('read');
            }
            this.running(false);
            if (instance.commands.length) {
                var c=instance.commands.shift();
                if (this.getConnection().debug>0)
                    util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') buffered commands('+(instance.commands.length+1)+'): '+JSON.stringify(c));
                cl=instance.closing;
                instance.closing=false;
                this.write(c[0],c[1]);
                instance.closing=cl;
            } else
            if (instance.closing||instance.closeOnDone) this.close();
        },
        data: function(data) { // Don't call instance directly. This is called when a full sentence is received (typically a !re line)
            if (this.getConnection().debug>2)
                util.debug('Channel data: '+data);
            if (this.saveBuffer())
                instance.packet.push(data);
            this.emit('data',[data],this);
            //this.emit('read',[data],this);
        },
        close:function(force) { // Close instance channel.
            this.closing(true);
            if (
                this.closed() // if we're already closed. OR
              ||(!force        // force argument is false. AND
              &&(
                  instance.commands.length // we still have commands waiting in the buffer OR
                ||this.running()           // we're running.
                )
              )) return; // then return because there is more to do, and we are still waiting.
            // At this point, force is true, or there is nothing left running.
            // If force is true, then we should be running.
            instance.commands=[]; // Empty the buffer.. we're closing.
            // So, if we're running, then issue a cancel. We're forcing it.
            if (this.running()) this.getConnection().write(['/cancel','=tag='+this.getId()]);
            if (this.getConnection().debug>1) 
                util.debug('Closing host:channel: '+this.getConnection().getHost()+':'+this.getId());
            // call the close channel on the connection.
            this.closed(true);
            this.getConnection().closeChannel(this.getId());
            this.emit('close',this);
            // remove our listeners!
            this.removeAllListeners();
        },
        finalize:function() {
            if (this.getConnection().debug>3) util.debug('Channel Finalize: '+this.getId());
            if (!instance.closing) this.close();
        }
    };
    c=this;
    Object.keys(o).forEach(function(k){c[k]=o[k]});
}
})();
