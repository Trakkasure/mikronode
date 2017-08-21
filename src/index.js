import util from 'util';
import net from 'net';
import TLS from 'tls';
import Promise from 'promise';
import {Subject, Observable} from 'rxjs';
import {autobind} from 'core-decorators';
import crypto from 'crypto';
import dns from 'dns';

import {hexDump, decodeLength, encodeString, objToAPIParams, resultsToObj, getUnwrappedPromise} from './Util.js';
import {STRING_TYPE, DEBUG, CONNECTION,CHANNEL,EVENT} from './constants.js';
import parser from './parser.js';

import Connection from './Connection';

const Socket=net.Socket;

const nullString=String.fromCharCode(0);

class MikroNode {

    /** Host to connect */
    @Private
    host;

    /** Port to connect */
    @Private
    port;

    /** Debug Level */
    @Private
    debug=DEBUG.NONE;

    /** Timeout for connecting. */
    @Private
    timeout;

    /** Socket connected to mikrotik device */
    @Private
    sock;

    @Private
    status=CONNECTION.DISCONNECTED;

    @Private
    tls=null;

    @Private
    socketOpts={};

    @Private
    socketProto='tcp4';
/**
 * Creates a MikroNode API object.
 * @exports mikronode
 * @function
 * @static
 * @param {string} host - The host name or ip address
 * @param {number} [port=8728] - Sets the port if not the standard 8728 (8729 for
 *           TLS).
 * @param {number} [timeout=0] - Sets the socket inactivity timeout. A timeout
 *           does not necessarily mean that an error has occurred, especially if you're
 *           only listening for events.
 * @param {(object|boolean)} [options.tls] - Set to true to use TLS for this connection.
 *           Set to an object to use TLS and pass the object to tls.connect as the tls
 *           options. If your device uses self-signed certificates, you'll either have to
 *           set 'rejectUnauthorized : false' or supply the proper CA certificate. See the
 *           options for
 *           {@link https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback|tls.connect()}
 *           for more info.
 * @throws <strong>WARNING: If you do not listen for 'error' or 'timeout' events and one
 *            occurrs during the initial connection (host unreachable, connection refused,
 *            etc.), an "Unhandled 'error' event" exception will be thrown.</strong>
 * 
 * @example
 * 
 * <pre>
 * var MikroNode = require('mikronode');
 * 
 * var device1 = new MikroNode('192.168.88.1')
 * var device2 = new MikroNode('192.168.88.2')
 * var promise1 = Observable.fromPromise(device1.connect('admin', 'mypassword'));
 * var promise2 = Observable.fromPromise(device2.connect('admin', 'mypassword'));
 *
 *  // When connected to both servers.
 *  Observable.zip(promise1,promise2).subscribe(function(connections) {
 *      connections[0].closeOnDone(true); // Set close on done for the connection. All channels must be done before this will issue done.
 *      connections[1].closeOnDone(true);
 *      var channel1=connections[0].openChannel(null,true); // choose chanel number for me, close chanel on done.
 *      var channel2=connections[1].openChannel(null,true); // choose chanel number for me, close chanel on done.
 *      // Everything is an observable stream now. Much more powerful
 *      channel1.data.merge(channel2.data).map(function(sentence){ return sentence; // do something cool mapping streams from both devices })
                .filter(function(sentence){ return sentence.type!='trap'}) // filter out traps. We could split off the stream and handle it somewhere else.
 *              .subscribe(function(sentence){ console.log(sentence)}
 *  }
 * , null
 * , function(err)
 *     console.error('Error when connecting: ', err);
 *   });
 * 
 * </pre>
 */
    constructor(host,port=8728,timeout=5) {
        // const {debug,port,timeout}=opts;
        this.host=host;
        this.port=port;
        this.timeout=timeout;
    }

    /** Change debug level **/
    setDebug(debug) {
        this.debug=debug;
        if (this.sock) this.sock.setDebug(debug);
        if (this.connection) this.connection.setDebug(debug);
    }

    /** Change the port */
    setPort(port) {
        this.port=port;
    }

    /** get/set tls options for this connection */
    TLS(opts={}) {
        if (opts) {
            this.tls=opts;
            if (opts.host) this.host=opts.host;
            if (opts.port) this.port=opts.port;
            return this;
        }
        return this.tls;
    }

    set socketOpts(opts) {
        this.socketOpts=opts;
        if (opts.host) this.host=opts.host;
        if (opts.port) this.port=opts.port;
    }
    /** Set timeout for socket connecion */
    setTimeout(timeout) {
        this.timeout=timeout;
        this.sock.setTimeout(timeout);
    }

    /** Connect to remote server using ID and password */
    connect(arg1,arg2) {
        this.debug>=DEBUG.INFO&&console.log('Connecting to '+this.host);

        let cb;
        this.debug>=DEBUG.SILLY&&console.log('Creating socket');
        this.sock = new SocketStream(this.timeout,this.debug,this.tls?typeof this.tls===typeof {}?this.tls:{}:false);
        const stream=this.sock.getStream();

        if (typeof arg1===typeof {}) {
            this.socketOpts={...this.socketOpts,arg1};
            if (typeof arg1===typeof function(){})
                cb=arg2;
        } else if (typeof arg1===typeof function(){}) cb=arg1;

        const close=()=>this.sock.getStream().sentence.complete();

        const login=(user,password,cb)=>{
            this.debug>=DEBUG.DEBUG&&console.log('Logging in');
            stream.write('/login');
            const {promise,resolve,reject}=getUnwrappedPromise();
            // Create a connection handler
            this.connection=new Connection(
                {...stream,close},
                challenge=>{
                    const md5=crypto.createHash('md5');
                    md5.update(Buffer.concat([Buffer.from(nullString+password),Buffer.from(challenge)]));
                    stream.write([
                        "/login",
                        "=name="+user,
                        "=response=00"+md5.digest("hex")
                    ]);
                },{resolve,reject}
            );
            this.connection.setDebug(this.debug);
            promise.then(()=>{
                if (cb) cb(null,this.connection);
            },err=>{
                if (cb) cb(err,null);
            });
            return promise;
        };

        this.debug>=DEBUG.SILLY&&console.log('Creating promise for socket connect');
        const promise = new Promise((resolve,reject) => {
            this.debug>=DEBUG.SILLY&&console.log('Connecting to remote host. Detected %s',net.isIPv6(this.host)?'ipv6':net.isIPv4(this.host)?'ipv4':'DNS lookup');
            const fn=((net.isIPv4(this.host)||net.isIPv6(this.host))?((this.socketOpts.family=net.isIPv6(this.host)?6:4),(a,b)=>b(null,[a])):((this.socketOpts.family==6)?dns.resolve4:dns.resolve6));
            fn(this.host,(err,data)=>{
                if (err) {
                    return reject("Host resolve error: ",err);
                }
                // this.debug>=DEBUG.DEBUG&&console.log('Socket connect: ',{...this.socketOpts,...this.tls,host:this.host,port:this.port});
                this.sock.connect({
                    ...this.socketOpts,
                    ...this.tls,
                    host:data[0],
                    port:this.port
                }).then(([socketOpts,...args])=>{
                    this.debug>=DEBUG.DEBUG&&console.log('Connected. Waiting for login.');
                    // initiate the login process
                    resolve([login,socketOpts,...args]);
                    if (cb) cb(null,login,socketOpts,...args);
                    /* Initiate Login */
                    this.sock.getStream().sentence.take(1).subscribe(null,reject,null);
                }).catch(err=>{
                    if (cb) cb(err,null);
                    reject("Caught error in socket connect",err);
                });
                // reject connect promise if the socket throws an error.
            });
        });
        // Connect to the server.
        return promise;
    }
}

// Object.keys(DEBUG).forEach(k=>MikroNode[k]=DEBUG[k]);
const api=Object.assign(MikroNode,DEBUG);
export default Object.assign(api,{CONNECTION, CHANNEL, EVENT, resultsToObj, getUnwrappedPromise});

/** Handles the socket connection and parsing of infcoming data. */
/* This entire class is private (not exported) */
class SocketStream {

    @Private
    rawSocket;

    @Private
    socket;

    @Private
    status=CONNECTION.NONE;

    @Private
    debug=DEBUG.NONE;

    @Private
    sentence$

    @Private
    parsed$;

    @Private
    data$;

    constructor(timeout,debug,tls) {
        debug>=DEBUG.DEBUG&&console.log('SocketStream::new',[timeout,debug]);

        this.debug=debug;
        this.rawSocket = new Socket();

        this.socket=tls?new TLS.TLSSocket(this.rawSocket,tls):this.rawSocket;

        this.sentence$=new Subject();
        // Each raw sentence from the stream passes through this parser.
        this.parsed$=this.sentence$
            .map(o=>o.join('\n')) // Make array string.
            .do(d=>this.debug>=DEBUG.SILLY&&console.log("Data to parse:",d))
            .map(d=>{var s=parser.parse(d);s.host=this.host;return s;})
            .flatMap(d=>Observable.from(d)) // break off observable from parse stream.
            .share(); // parse the string.

        // When we receive data, it is pushed into the stream defined below.
        this.data$=Observable.fromEvent(this.socket,'data');
        // this is the stream reader/parser.
        this.data$.scan((last,stream,i)=>{
            let buff=Buffer.concat([last.b,stream]),
                l=last.len,
                o=last.o,
                c,go;

            this.debug>=DEBUG.DEBUG&&console.log("Packet received: ",last,stream);
            // If the xpected length of lst process is zero, we expect to be told next buffer length.
            if(!last.len) {
                // Getting length;
                this.debug>=DEBUG.SILLY&&console.log("Getting length");
                [buff,l] = decodeLength(buff);
                this.debug>=DEBUG.SILLY&&console.log("Length: ",l);
                // We didn't get all of the data from this buffer. Wait for next packet.
                if (buff.length<l) {
                    this.debug>=DEBUG.DEBUG&&console.log("Buffer shorter than expected data, waiting for next packet.",{b:buff,len:l,o:o});
                    return {b:buff,len:l,o:o};
                }
            }
            go=buff.length>0;
            this.debug>=DEBUG.SILLY&&console.log("Starting parse loop w/existing length ",l);
            while(go) {
                c = buff.slice(0,l).toString('utf8');
                this.debug>=DEBUG.SILLY&&console.log("Extracted data: ",c);
                // Push content as sentence piece.
                o.push(c);
                // If we detected end of sentence
                if (buff[l]===0) {
                    // then post new sentence.
                    this.debug>=DEBUG.DEBUG&&console.log('Detected end of sentence, posting existing sentence',o);
                    this.sentence$.next(o);
                    // Reset sentence buffer.
                    l++;
                    o=[];
                }
                this.debug>=DEBUG.SILLY&&console.log("Getting length",buff.slice(l));
                [buff,l] = decodeLength(buff.slice(l));
                this.debug>=DEBUG.SILLY&&console.log("Length",l);
                if (!l) {
                    this.debug>=DEBUG.DEBUG&&console.log('End of data, nothing left to process');
                    go=false;
                    return {b:Buffer.from([]),len:0,o:[]};
                }
                if (buff.length<l) {
                    this.debug>=DEBUG.DEBUG&&console.log("Buffer shorter than expected data, waiting for next packet.",{b:buff,len:l,o:o});
                    return {b:buff,len:l,o:o};
                }
            }
        },{b:Buffer.from([]),len:0,o:[]})
        .subscribe(e=>this.debug>=DEBUG.DEBUG&&e.len&&console.log('Buffer leftover: ',e),closeSocket,closeSocket);


        this.socket.on('end',a => {
            this.debug>=DEBUG.INFO&&console.log('Connection end '+a);
            if (this.status==CONNECTION.CONNECTED)
                // Completing the sentence closes all downstream observables and completes any subscriptions.
                this.sentence$.complete();
                // this.handler.close(true);
        });

        this.socket.on('error',a => {
            this.debug>=DEBUG.ERROR&&console.log('Connection error: '+a);
            // Erroring the sentence closes all downstream observables and issues error any subscriptions.
            this.sentence$.error(a);
        });

        this.setTimeout(timeout);

        // This is the function handler for error or complete for the parsing functions.
        const closeSocket=(e)=>{
            this.debug>=DEBUG.DEBUG&&console.log("Closing Socket ",e);
            e?this.rawSocket.destroy(e):this.rawSocket.destroy();
        }
        /** Listen for complete on stream to dictate if socket will close */
        this.sentence$
            // .do(d=>console.log("Sentence: ",d))
            .subscribe(null,closeSocket,closeSocket);

        // This will be called if there is no activity to the server.
        // If this occurs before the login is successful, it could be
        // that it is a connection timeout.
        this.socket.setKeepAlive(true); 
        this.b=[];
        this.len=0;
        this.line='';

    }

    setDebug(d) {
        this.debug>=DEBUG.DEBUG&&console.log('SocketStream::setDebug',[d]);
        this.debug=d;
    }

    setTimeout(timeout) {
        this.debug>=DEBUG.DEBUG&&console.log('SocketStream::setTimeout',[timeout]);
        this.socket.setTimeout(timeout*1000,e=>{ // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
            if (this.status!==CONNECTION.CONNECTED) {
                this.debug&&console.log('Socket Timeout');
                this.sentence$.error("Timeout: ",JSON.stringify(e));
                // self.emit('error','Timeout Connecting to host',self);
            }
        });
    }

    /** Connect the socket */
    connect(socketOpts) {
        this.debug>=DEBUG.DEBUG&&console.log('SocketStream::Connect %s',this.tls?"(TLS)":"",socketOpts);
        this.status=CONNECTION.CONNECTING;
        this.host = socketOpts.host||'localhost';
        return new Promise((res,rej)=>{
            // Connect to the socket. This works for both TLS and non TLS sockets.
            try {
                this.rawSocket.connect(socketOpts,(...args)=>{
                    this.debug>=DEBUG.INFO&&console.log('SocketStream::Connected ',args,socketOpts);
                    this.status=CONNECTION.CONNECTED;
                    socketOpts={
                        ...socketOpts,
                        localAddress:this.socket.localAddress,
                        localPort:this.socket.localPort
                    };
                    if (this.socket.encrypted)
                        res([{
                            ...socketOpts,
                            authorized:this.socket.authorized,
                            authorizationError:this.socket.authorizationError,
                            protocol: this.socket.getProtocol(),
                            alpnProtocol:this.socket.alpnProtocol,
                            npnProtocol:this.socket.npnProtocol,
                            cipher: this.socket.getCipher(),
                            cert: this.socket.getPeerCertificate(),
                        },...args]);
                    else res([socketOpts,...args]);
                });
            } catch (e) {
                rej("Caught exception while opening socket: ",e)
            }
        });
    }

    /** Provides access to all of the different stages of input streams and the write stream. */
    getStream() {
        return {sentence:this.sentence$,write:this.write,read:this.parsed$,raw:this.data$};
    }

    @autobind
    write(data,args) {
        if (args && typeof(args)===typeof({}))  {
            this.debug>=DEBUG.SILLY&&console.log("Converting obj to args",args);
            data=data.concat(objToAPIParams(args,data[0].split('/').pop()));
        }
        this.debug>=DEBUG.DEBUG&&console.log('SocketStream::write:',[data]);
        if (!this.socket||!(this.status&(CONNECTION.CONNECTED|CONNECTION.CONNECTING))) {
            this.debug>DEBUG.WARN&&console.log('write: not connected ');
            return;
        }
        if (typeof(data)===STRING_TYPE) data=[data];
        else if (!Array.isArray(data)) return;
        data.forEach(i => {
            try {
                this.debug>=DEBUG.DEBUG&&console.log('SocketStream::write: sending '+i);
                this.socket.write(encodeString(i,this.debug&DEBUG.SILLY));
            } catch(error) {
                this.sentence$.error(error);
            }
        });
        this.socket.write(nullString);
    }
}

