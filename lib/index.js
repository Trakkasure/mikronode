var Socket=require('net').Socket;
var events=require('events');
var crypto=require('crypto');
var util=require('util');
var emptyString=String.fromCharCode(0);
function api(host,user,password,options) {
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
        this._connected=false; // If we are connected.
        this.line=''; // current line. When the line is built, the sentence event is called.
        this.buffer=[]; // buffer holding incoming stream from socket
        this.packet=[]; // current packet
        this.channel={}; // all channels in use
        this.trap=false; // we encountered a trap.
        this.error=[]; //Buffer errors
        this._closeOnDone=false; // when !done event is called, close the connection.
        this.datalen=0; // Used to look-ahead to see if more data is available after !done is received.
        api._conn[this.hash]=this;
}

api._conn={};
/**
 * Parse !re return records into an array of objects
 */
api.parseItems=function(data) {
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
/*
 * Instance methods of the connection object (returned after calling new)
 */
var funcs={
    closeOnDone: function(b) { return typeof(b)=='boolean'?this._closeOnDone=b:this._closeOnDone; },
    isConnnected: function() { return this._connected; },
    encodeString:function(s) {
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
    },
    connect:function(callBack) {
        if (this._connected) return;
        this.connectionCallback=callBack;
        var self=this;
        self.status='Connecting';
        loginHandler=function(d) {
            if (self.debug>2)
                util.debug('LoginHandler: '+self.status+' : '+self.host);
            switch(self.status) {
                case 'Connecting':
                    self.status='Sending Login';
                    if (self.debug>2) util.debug(self.status);
                    self.write('/login');
                    break;
                case 'Sending Login':
                    if (d.length<1) return;
                    if (d=='!done') {
                        if (self.debug>2) util.debug('Got !done. Need challenge');
                        return; // waiting for challenge
                    }
                    if (d.match(/=ret=/)) {
                        if (self.debug>3)
                            util.debug('Got challenge');
                        self.status='Sending Credentials';
                        if (self.debug>2)
                            util.debug(self.status);
                        var challenge=''
                        var a=d.split('=')[2].split('');
                        while(a.length) challenge+=String.fromCharCode(parseInt("0x"+a.shift()+a.shift()));
                        if (challenge.length!=16) {
                            self.status='Error';
                            if (self.debug>2) util.debug(self.status);
                            self.error='Bad connection response: '+d;
                            if (self.debug>3) util.debug('Challenge length:'+challenge.length);
                            if (self.debug) util.debug(self.error);
                            self.removeListener('sentence',loginHandler);
                            self.close();
                        } else {
                            self.write([
                                        "/login",
                                        "=name="+self.user,
                                        "=response=00"+crypto.createHash('md5').update(emptyString+self.password+challenge).digest("hex")
                                       ]
                            );
                        }
                    }
                    break;
               case 'Sending Credentials':
                    if (d=='!done') {
                        self.status='Connected';
                        self.removeAllListeners('sentence');
                        self.removeAllListeners('fatal');
                        self.removeAllListeners('trap');
                        self.addListener('sentence',function(data){self.sentence(data)});
                        if (self.debug>2)
                            util.debug(self.status);
                        self._connected=true;
                        if (self.connectionCallback) {
                            self.connectionCallback(self);
                            self.connectionCallback=null;
                        }
                    } else {
                        if (self.debug>2)
                            util.debug(self.status);
                        self.sentence(d); // start off trap processing.
                    }
                    break;
                case 'Connected':
                    self.removeListener('sentence',loginHandler);
            }
        }
        if (this.debug>3) util.debug('Creating Socket to '+this.host);
        this.addListener('sentence',loginHandler);
        this.addListener('fatal',function(conn){this.close()});
        this.addListener('trap',function(conn){this.close()});
        this.socket=new Socket({type:'tcp4'});
        if (this.debug>3) util.debug('Connecting to '+this.host);
        this.socket.on('data',function(a){self.read(a)});
        this.socket.on('error',function(a){
            if (this.debug>1)util.log('Connection error: '+a);
            self.socket.destroy();
            self._connected=false;
            delete api._conn[self.hash];
            self.emit('error',a,self)
            self.emit('close',self);
            self.removeAllListeners();
        });
        // This will be called if there is no activity to the server.
        // If this occurs before the login is successful, it could be
        // that it is a connection timeout.
        this.socket.setTimeout(this.timeout*1000,this.socketTimeout);
        this.socket.connect(this.port,this.host,loginHandler);
        this.socket.setKeepAlive(true); 
        return this;
    },
    sentence:function(data) {
        if (this.debug>2) util.debug('Sentence:data: '+data);
        if (this.fatal) { // our last message was a fatal error.
            //util.debug('Sentence: fatal error: '+data);
            this.packet.push(data);
            this.emit('fatal',this.packet,this);
            if (!this._closing) this.close();
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
                this.emit('trap',e,this);
            } else // no trap. Send general packet.
            if (this.len||this.datalen) {// we may have a tag.
                if (this.debug>2) util.debug('Sentence: Could have a tag.');
                this.nextTag=1;
            }
            else
                this.emit('done',this.packet,this);
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
    },
    write:function(a) { // This shouldn't be called directly. Please use channels.
        if (!this._connected) return;
        if (typeof(a)==='string') a=[a];
        else if (!Array.isArray(a)) return;
        var self=this;
        a.forEach(function(i){
            if (self.debug>2)
                 util.debug('write: sending '+i);
            self.socket.write(self.encodeString(i));
        });
        this.socket.write(emptyString);
    },
    read:function(data) { // This is the handler for when the socket receives data. Don't call this function directly
        while(data.length) {
            if (this.debug>3) util.debug('read: data-len:'+data.length);
            if (this.len) { // maintain the current data length. What if the data comes in 2 separate packets?
                            // I am hopping that the API on the other end doesn't send more than one channel
                            // at a time if more than one packet is required.
                if (this.debug>3) util.debug('read: len:'+this.len);
                if (this.debug>3) util.debug('read: data:'+data);
                if (data.length<=this.len) {
                    this.len-=data.length;
                    this.line+=data.toString();
                    this.datalen=0;
                    if (this.debug>3) util.debug('read-more: data:'+this.line);
                    if (this.len==0) {
                        this.emit('sentence',this.line);
                        this.line='';
                    }
                    break;
                } else {
                    this.line+=data.toString('utf8',0,this.len);
                    if (this.debug>3) util.debug('read-less: data:'+this.line);
                    var l=this.line;
                    this.line='';
                    data=data.slice(this.len);
                    this.datalen=data.length
                    this.emit('sentence',l);
                    var x=this.decodeLength(data);
                    this.len=x[1];
                    data=data.slice(x[0]);
                }
            } else {
                var x=this.decodeLength(data);
                this.len=x[1];
                data=data.slice(x[0]);
            }
        }
    },
    decodeLength: function(data){ // Ported from the PHP API on the Wiki. Thanks
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
        if (this.debug>3) 
            util.debug('Len: '+len+'  IDX: '+idx);
        return [idx,len];
    },
    openChannel:function(id) {
        if (!id) {
            id=Object.keys(this.channel).length+1;
            while (this.channel[id]) id++;
        } else
        if (this.channel[id]) throw('Channel already exists for ID '+id);
        if (this.debug>1) 
            util.debug('Opening channel: '+id);
        var o=this.channel[id]=new channel(id,this);
        return o;
    },
    closeChannel:function(id) {
        if (!id) throw("Missing ID for stream channel to close.");
        if (!this.channel[id]) throw('Channel does not exist for ID '+id);
        // Make sure that the channel closes itself... so that remaining commands will execute.
        if (!this.channel[id]._closing) return this.channel[id].close();
        if (this.debug>0) 
            util.debug('Closing channel: '+id);
        delete this.channel[id];
        if (Object.keys(this.channel).length==0 && this._closing) this.close();
    },
    close:function(force) {
        if (!force&&this.channel&&Object.keys(this.channel).length) {
            this._closing=true;
            return;
        }
        if (this.debug>0) util.log('Connection disconnecting: '+this.host);
        this.removeAllListeners('done');
        var self=this;
        if (force) Object.keys(this.channel).forEach(function(e){self.channel[e].close(true);});
        this.once('fatal',function(d){ // quit command ends with a fatal.
            if (self.debug>0) util.log('Connection disconnected: '+this.host);
            self.socket.destroy();
            self._connected=false;
            self.removeAllListeners('sentence');
            self.emit('close',self);
            self.removeAllListeners();
        });
        this._closing=false;
        delete api._conn[this.hash];
        this.write(['/quit']);
        this._closing=true;
    },
    socketTimeout:function(e,c) { // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
        if (this.debug) 
	    util.debug('Socket Timeout');
	if (!this._connected)
		this.emit('error','Timeout Connecting to host',this);
    },
    finalize:function() {
        this.close(true);
    }
};

util.inherits(api,events.EventEmitter);
for (i in funcs) {
    api.prototype[i]=funcs[i];
}

module.exports=api;


/*
 * This is the channel definition.
 */
function channel(id,conn) {
    this.id=id;
    this._conn=conn;
    this.buffer=[];
    this._saveBuffer=true;
    this._closeOnDone=false;
    this.writeCallback=null;
    this.packet=[];
    this._running=false;
    this.commands=[];
}
funcs={
    getId:function(){return this.id},
    setSaveBuffer: function(b) { // Sets wether to buffer content for final call or not.
        this._saveBuffer=b;
    },
    getConnection:function(){return this._conn},
    isRunning: function() { return this._running; },
    closeOnDone: function(b) { return typeof(b)=='boolean'?this._closeOnDone=b:this._closeOnDone; },
    write:function(d,writeCallback) { 
        if (this._closing) return;
        if (d) {
            if (typeof(d)=='string')
                d=d.split(/\n/);
            if (Array.isArray(d)&&d.length)
                this.buffer=this.buffer.concat(d);
            else return;
        } else {
            if (this._conn.debug>0) util.debug('Channel ('+this._conn.host+":"+this.id+') write: empty arg.');
        }
        if (this._running) {
            if (this._conn.debug>0) util.debug('Channel ('+this._conn.host+":"+this.id+') write: pushing command.');
            this.commands.push([this.buffer,writeCallback]);
            this.buffer=[];
        } else {
            this._running=true;
            this._saveBuffer=true;
            this.callback=writeCallback;
            this.callback(this); // allow setup before sending command.
            this.callback=null;
            this.buffer.push('.tag='+this.id);
            if (this._conn.debug>0) util.debug('Channel ('+this._conn.host+":"+this.id+') write lines: '+this.buffer.join("\n"));
            this._conn.write(this.buffer); // Send command.
            this.buffer=[];
        }
    },
    done: function(data) { // Don't call this directly. This is called when the data stream is complete for this channel.
        if (this._conn.debug>0)
            util.debug('Channel done: ('+this._conn.host+":"+this.id+')');
        var p=this.packet;
        this.packet=[];
        this.emit('done',p,this);
        this._running=false;
        if (this.commands.length) {
            var c=this.commands.shift();
            if (this._conn.debug>0)
                util.debug('Channel ('+this._conn.host+":"+this.id+') buffered commands('+this.commands.length+1+'): '+JSON.stringify(c));
            cl=this._closing;
            this._closing=false;
            this.write(c[0],c[1]);
            this._closing=cl;
        } else
        if (this._closing||this._closeOnDone) this.close();
    },
    read: function(data) { // Don't call this directly. This is called when a full sentence is received (typically a !re line)
        if (this._conn.debug>2)
            util.debug('Channel read: '+data);
        if (this._saveBuffer)
            this.packet.push(data);
        this.emit('read',data,this);
    },
    close:function(force) { // Close this channel.
        this._closing=true;
        if (!force&&this._running) return;
        if (this._running) this._conn.write(['/cancel','=tag='+this.id]);
        if (this._conn.debug>0) util.debug('Closing host:channel: '+this._conn.host+':'+this.id);
        this._conn.closeChannel(this.id);
        this._closed=true;
        this.emit('close',this);
        if (this._conn._closing||this._conn._closeOnDone) this._conn.close();
    },
    finalize:function() {
        if (this._conn.debug>3) util.debug('Channel Finalize: '+this.id);
        if (!this._closing) this.close();
    }
};
util.inherits(channel,events.EventEmitter);
for (i in funcs) {
    channel.prototype[i]=funcs[i];
}

