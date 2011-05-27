var Socket=require('net').Socket;
var events=require('events');
var crypto=require('crypto');
//var futures=require('futures');
var util=require('util');
var emptyString=String.fromCharCode(0);
var api;
(function(){

/**
 * Parse !re return records into an array of objects
 */
/*
 * Instance methods of the connection object (returned after calling new)
 */
function encodeString(s) {
    var l=s.length;
    var r;
    if (l < 0x80) {
        r = String.fromCharCode(l);
    } else if (l < 0x4000) {
        r |= 0x8000;
        r = String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode(l & 0xFF);
    } else if (l < 0x200000) {
        r |= 0xC00000;
        r = String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode(l & 0xFF);
    } else if (l < 0x10000000) {
        r |= 0xE0000000;
        r = String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode(l & 0xFF);
    } else if (l >= 0x10000000)
        l = String.fromCharCode(0xF0) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode( (l >> 8) & 0xFF) + String.fromCharCode(l & 0xFF);
    return r+s;
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
function MikroNode(host,user,password,options) {
    return new api(host,user,password,options);
}
api=function (host,user,password,options) {
    this.hash=crypto.createHash('md5').update(host+user).digest('hex');
    //  If we already have a connection, return the same one.
    if (!options) options={};
    if (api._conn[this.hash]) return api._conn[this.hash];
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
    this.error=[]; //Buffer errors
    this.closeOnDone=false; // when !done event is called, close the connection.
    this.datalen=0; // Used to look-ahead to see if more data is available after !done is received.
    api._conn[this.hash]=this;
    return this.handler=new Connection(this);
}
util.inherits(api,events.EventEmitter);
api.prototype.sentence=function(data) {
    if (this.debug>2) util.debug('Sentence:data: '+data);
    if (this.fatal) { // our last message was a fatal error.
        //util.debug('Sentence: fatal error: '+data);
        this.packet.push(data);
        this.handler.emit('fatal',this.packet,this);
        if (!this.closing) this.close();
        return;
    } else
    if (data=='!fatal') { //we were sent a fatal message... wait for next sentence to get message.
        this.fatal=true;
    } else
    if (data=='!done') { // we got a done signal... but we could be in a channel.
        this.packet=this.buffer;
        this.buffer=[];
        if (this.debug>2) util.debug('Sentence: Done Signal.');
        if (this.trap) {// we previously caught a trap
            this.trap=false;
            var e=this.error;
            this.error=[];
            if (this.debug>2) util.debug('Sentence: Sending trap.');
            this.handler.emit('trap',e,this.handler);
        } else {// no trap. Send general packet.
        //if (this.len||this.datalen) {// we may have a tag.
            if (this.debug>2) util.debug('Sentence: Could have a tag.');
            this.nextTag=1;
        }
        //else
            //this.handler.emit('done',this.packet,this.handler);
    } else
    if (this.nextTag) { // We had a done event, this could be a tag.
        this.nextTag=0;
        if (data.match(/\.tag/)) {// Check if we have a tag.
            var channel=data.substring(5);
            if (this.debug>2) util.debug('Sentence: Done channel '+channel+'.');
            if (this.trap) { // if we're in a trap, send trap globally, since tag terminates a trap.
                this.trap=false;
                var e=this.error;
                this.error=[];
                if (this.debug>2) util.debug('Sentence: Sending trap.');
                this.channel[channel].emit('trap',e,this.channel[channel]);
            }
            if (this.channel[channel])
                this.channel[channel].done(this.packet);
        } else
        if (data.match(/=ret/)) {
            this.nextTag=1;
        }
        this.buffer.push(data);
    } else
    if (data.match(/\.tag/)) { // Catch tags where it's not following !done
        this.packet=this.buffer; // backup up the packet
        this.buffer=[];
        var channel=data.substring(5);
        if (this.trap) {// we previously caught a trap
            this.trap=false;
            var e=this.error;
            this.error=[];
            if (this.debug>2) util.debug('Sentence: Sending trap in channel: '+channel);
            if (this.channel[channel]) this.channel[channel].emit('trap',e,this.channel[channel]);
        } else  // no trap. Send general packet.
            if (this.channel[channel])
                this.channel[channel].read(this.packet);
    } else
    if (this.trap) {
        var l=data.split(/=/);
        if (l.length>1) {
            this.error[l[1]]=l[2];
            if (this.debug>2) util.debug('Sentence: Trap property: '+l[1]+' = '+l[2]);
        }
    } else
    if (data.match(/\!trap/)) {
        this.trap=true;
        if (this.debug>2) util.debug('Sentence: catching trap');
    } else {
        this.buffer[this.buffer.length]=data;
    }
}
api.prototype.read=function(data) { // This is the handler for when the socket receives data. Don't call instance function directly
    while(data.length) {
        if (this.debug>3) util.debug('read: data-len:'+data.length);
        if (this.len) { // maintain the current data length. What if the data comes in 2 separate packets?
                        // I am hopping that the API on the other end doesn't send more than one channel
                        // at a time if more than one packet is required.
            if (this.debug>3) util.debug('read: len:'+this.len);
            //if (this.debug>3) util.debug('read: data:'+data);
            if (data.length<=this.len) {
                this.len-=data.length;
                this.line+=data.toString();
                this.datalen=0;
                if (this.debug>3) util.debug('read:consume-all: data:'+data);
                if (this.len==0) {
                    this.emit('sentence',this.line);
                    this.line='';
                }
                break;
            } else {
                if (this.debug>3) util.debug('read:consume len: data:'+data);
                this.line+=data.toString('utf8',0,this.len);
                var l=this.line;
                this.line='';
                data=data.slice(this.len);
                this.datalen=data.length
                this.emit('sentence',l);
                var x=decodeLength(data);
                this.len=x[1];
                data=data.slice(x[0]); // get rid of excess buffer
                if (this.len==1&&data[0]=="\x00") {
                    this.len=0;
                    this.data=[];
                }
            }
        } else {
            var x=decodeLength(data);
            this.len=x[1];
            data=data.slice(x[0]);
        }
    }
}
api.prototype.write=function(a) { // This shouldn't be called directly. Please use channels.
    if (!this.connected&&!this.connecting) {
        if (this.debug>2)
             util.debug('write: not connected ');
        return;
    }
    if (typeof(a)==='string') a=[a];
    else if (!Array.isArray(a)) return;
    var self=this;
    a.forEach(function(i){
        if (this.debug>2)
             util.debug('write: sending '+i);
        self.socket.write(encodeString(i));
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
    this.socket.on('error',function(a){
        if (self.debug>1)util.log('Connection error: '+a);
        self.socket.destroy();
        self.connected=false;
        delete api._conn[this.hash];
        self.handler.emit('error',a,this.handler)
        self.handler.emit('close',this.handler);
        self.handler.removeAllListeners();
    });
    // This will be called if there is no activity to the server.
    // If this occurs before the login is successful, it could be
    // that it is a connection timeout.
    this.socket.setTimeout(this.timeout*1000,this.socketTimeout);
    this.socket.connect(this.port,this.host,connectHandler);
    this.socket.setKeepAlive(true); 
}
//api.closeEvent()

function Connection(instance) {
    var o={
    status: "New",
    debug: instance.debug,
    closeOnDone: function(b) { return typeof(b)=='boolean'?instance.closeOnDone=b:instance.closeOnDone;},
    connnected: function() { return instance.connected; },
    getHost: function() { return instance.host;},
    getUser: function() { return instance.user;},
    setHost: function(h) { if (instance.connected) return this;this.host=h; return this},
    closeOnFatal: function(b){ if (b) self.addListener('fatal',function(conn){instance.close()}); return this},
    connect:function(callBack) {
        if (instance.connected) return;
        this.connectionCallback=callBack;
        var self=this; // this is the local object.
        this.status="Connecting";
        loginHandler=function(d) {
            if (instance.debug>2)
                util.debug('LoginHandler: '+self.status+' : '+self.getHost());
            switch(self.status) {
                case 'Connecting':
                    self.status='Sending Login';
                    if (instance.debug>2) util.debug(self.status);
                    instance.write('/login');
                    break;
                case 'Sending Login':
                    if (d.length<1) return;
                    if (d=='!done') {
                        if (instance.debug>2) util.debug('Got !done. Need challenge');
                        return; // waiting for challenge
                    }
                    if (d.match(/=ret=/)) {
                        if (instance.debug>3)
                            util.debug('Got challenge');
                        self.status='Sending Credentials';
                        if (instance.debug>2)
                            util.debug(self.status);
                        var challenge=''
                        var a=d.split('=')[2].split('');
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
                            instance.write([
                                        "/login",
                                        "=name="+instance.user,
                                        "=response=00"+crypto.createHash('md5').update(emptyString+instance.password+challenge).digest("hex")
                                       ]
                            );
                        }
                    }
                    break;
               case 'Sending Credentials':
                    if (d=='!done') {
                        self.status='Connected';
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
                    } else {
                        if (instance.debug>2)
                            util.debug(self.status);
                        instance.sentence(d); // start off trap processing.
                    }
                    break;
                case 'Connected':
                    instance.removeListener('sentence',loginHandler);
            }
        }
        instance.addListener('sentence',loginHandler);
        instance.addListener('fatal',function(conn){self.close()});
        instance.addListener('trap',function(conn){self.close()});
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
    write: function(a){return instance.write(a)},
    closeChannel:function(id) {
        if (!id) throw("Missing ID for stream channel to close.");
        if (!instance.channel[id]) throw('Channel does not exist for ID '+id);
        // Make sure that the channel closes itself... so that remaining commands will execute.
        if (!instance.channel[id].closing) return instance.channel[id].close();
        if (instance.debug>0) 
            util.debug('Closing channel: '+id);
        delete instance.channel[id];
        if (Object.keys(instance.channel).length==0 && (instance.closing || instance.closeOnDone)) this.close();
    },
    close:function(force) {
        if (!force&&instance.channel&&Object.keys(instance.channel).length) {
            instance.closing=true;
            return;
        }
        if (instance.debug>0) util.log('Connection disconnecting: '+this.getHost());
        instance.removeAllListeners('done');
        var self=this;
        if (force) Object.keys(instance.channel).forEach(function(e){self.channel[e].close(true);});
        this.once('fatal',function(d){ // quit command ends with a fatal.
            if (instance.debug>0) util.log('Connection disconnected: '+this.getHost());
            instance.socket.destroy();
            instance.connected=false;
            instance.removeAllListeners();
            self.emit('close',self);
            self.removeAllListeners();
        });
        instance.closing=false;
        delete api._conn[instance.hash];
        instance.write(['/quit']);
        instance.closing=true;
    },
    socketTimeout:function(e,c) { // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
        if (instance.debug) 
            util.debug('Socket Timeout');
        if (!instance.connected)
                this.emit('error','Timeout Connecting to host',instance);
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
MikroNode.parseItems=function(data) {
    var db=[];
    var idx=0;
    var record={};
    data.forEach(function(data){
        while(data.length) {
            l=data.shift().split(/=/);
            if (l[0]=='!re') {
                if (db.length) {
                    record={};
                }
                db.push(record);
                idx++;
                continue;
            }
            l.shift(); //remove empty first element
            record[l.shift()]=l.join('='); // next element is key. All the rest is value.
        }
        if (data.length==1&&data[0]!=record) db.push(record);
    });
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
    this.commands=[];
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
        closeOnDone: function(b) { return typeof(b)=='boolean'?instance.closeOnDone=b:instance.closeOnDone; },
        write:function(d,writeCallback) {
            if (this.closing()) return;
            if (d) {
                if (typeof(d)=='string')
                    d=d.split(/\n/);
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
                this.running(true);
                this.saveBuffer(true);
                this.callback=writeCallback;
                this.callback(this); // allow setup before sending command.
                this.callback=null;
                this.buffer.push('.tag='+this.getId());
                if (this.getConnection().debug>0) util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') write lines: '+this.buffer.join("\n"));
                this.getConnection().write(this.buffer); // Send command.
                this.buffer=[];
            }
        },
        done: function(data) { // Don't call instance directly. This is called when the data stream is complete for instance channel.
            if (this.getConnection().debug>0)
                util.debug('Channel done: ('+this.getConnection().getHost()+":"+this.getId()+')');
            var p=instance.packet;
            instance.packet=[];
            this.emit('done',p,this);
            this.removeAllListeners('done');
            this.removeAllListeners('read');
            this.running(false);
            if (instance.commands.length) {
                var c=instance.commands.shift();
                if (this.getConnection().debug>0)
                    util.debug('Channel ('+this.getConnection().getHost()+":"+this.getId()+') buffered commands('+instance.commands.length+1+'): '+JSON.stringify(c));
                cl=instance.closing;
                instance.closing=false;
                this.write(c[0],c[1]);
                instance.closing=cl;
            } else
            if (instance.closing||instance.closeOnDone) this.close();
        },
        read: function(data) { // Don't call instance directly. This is called when a full sentence is received (typically a !re line)
            if (this.getConnection().debug>2)
                util.debug('Channel read: '+data);
            if (this.saveBuffer())
                instance.packet.push(data);
            this.emit('read',[data],this);
        },
        close:function(force) { // Close instance channel.
            instance.closing=true;
            if (!force&&this.running()) return;
            if (this.running()) this.getConnection().write(['/cancel','=tag='+this.getId()]);
            if (this.getConnection().debug>0) util.debug('Closing host:channel: '+this.getConnection().getHost()+':'+this.getId());
            this.getConnection().closeChannel(this.getId());
            instance._closed=true;
            this.emit('close',this);
            //if (this.getConnection().closing||this.getConnection().closeOnDone) this.getConnection().close();
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
