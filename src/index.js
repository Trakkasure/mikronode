import util from 'util';
import net from 'net';
import Promise from 'promise';
import {Subject, Observable} from 'rxjs';
import {autobind} from 'core-decorators';
import crypto from 'crypto';

import {hexDump, decodeLength, encodeString} from './Util.js';
import parser from './parser.js';


import Connection from './Connection';

const nullString=String.fromCharCode(0);
const emptyFunction=()=>{};
const STRING_TYPE=typeof "";
const NONE=0;
const ERROR=1;
const WARN=2;
const INFO=4;
const DEBUG=8;
const SILLY=16;

const DISCONNECTED=0;// Disconnected from device
                     // ERROR defined above means a connect or transport error.
const CONNECTING=2;  // Connecting to device
const CONNECTED=4;   // Connected and idle
const WAITING=8;     // Waiting for response(s)
const Socket=net.Socket;

export default class MikroNode extends util.EventEmitter {

    static NONE=0;
    static ERROR=1;
    static WARN=2;
    static INFO=4;
    static DEBUG=8;
    static SILLY=16;

    /** Host to connect */
    @Private
    host;

    /** Port to connect */
    @Private
    port;

    /** Debug Level */
    @Private
    debug=NONE;

    /** Timeout for connecting. */
    @Private
    timeout;

    /** Socket connected to mikrotik device */
    @Private
    sock;

    @Private
    status=DISCONNECTED;
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
        super();
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

    /** Set timeout for socket connecion */
    setTimeout(timeout) {
        this.timeout=timeout;
        this.sock.setTimeout(timeout);
    }

    /** Connect to remote server using ID and password */
    connect(user,password) {
        this.debug>=MikroNode.INFO&&console.log('Connecting to '+this.host);

        this.debug>=MikroNode.SILLY&&console.log('Creating socket');
        this.sock = new SocketStream(this.timeout,this.debug);
        const stream=this.sock.getStream();

        const login=challenge=>{
            const md5=crypto.createHash('md5');
            md5.update(Buffer.concat([Buffer.from(nullString+password),Buffer.from(challenge)]));
            stream.write([
                "/login",
                "=name="+user,
                "=response=00"+md5.digest("hex")
            ]);
        };

        const close=()=>this.sentence$.complete();
        this.debug>=MikroNode.SILLY&&console.log('Creating promise for socket connect');
        const promise = new Promise((resolve,reject) => {
            const connected = () => {
                // Create a connection handler
                this.debug>=MikroNode.DEBUG&&console.log('Logging in');
                stream.write('/login');
                this.connection=new Connection({...stream,close},login,{resolve,reject});
                this.connection.setDebug(this.debug);
                /* Initiate Login */
            };
            this.debug>=MikroNode.SILLY&&console.log('Connecting to remote host');
            this.sock.connect(this.host,this.port,connected);
            this.stream.sentence.subscribe(null,null,reject); // reject promise on error.
        });
        promise.then(null,(e)=>this.sentence$.error(e));
        // Connect to the server.
        return promise;
    }
}

/** Handles the socket connection and parsing of infcoming data. */
/* This entire class is private (not exported) */
class SocketStream {

    @Private
    socket;

    @Private
    status=NONE;

    @Private
    debug=NONE;

    @Private
    sentence$

    @Private
    parsed$;

    @Private
    data$;

    constructor(timeout,debug) {
        debug>=DEBUG&&console.log('SocketStream::new',[timeout,debug]);

        this.debug=debug;
        this.socket = new Socket({type:'tcp4'});

        this.sentence$=new Subject();
        this.parsed$=this.sentence$
            .map(o=>o.join('\n')) // Make array string.
            .do(d=>this.debug>=SILLY&&console.log("Data to parse:",d))
            .map(d=>parser.parse(d)).flatMap(d=>Observable.from(d)).share(); // parse the string.

        // When we receive data, it is pushed into the stream defined below.
        this.data$=Observable.fromEvent(this.socket,'data');
        // this is the stream reader/parser.
        this.data$.scan((last,stream,i)=>{
            let buff=Buffer.concat([last.b,stream]),
                l=last.len,
                o=last.o,
                c,go;

            this.debug>=DEBUG&&console.log("Packet received: ",last,stream);
            // If the xpected length of lst process is zero, we expect to be told next buffer length.
            if(!last.len) {
                // Getting length;
                this.debug>=SILLY&&console.log("Getting length");
                [buff,l] = decodeLength(buff);
                this.debug>=SILLY&&console.log("Length: ",l);
                // We didn't get all of the data from this buffer. Wait for next packet.
                if (buff.length<l) {
                    this.debug=>DEBUG&&console.log("Buffer shorter than expected data, waiting for next packet.",{b:buff,len:l,o:o});
                    return {b:buff,len:l,o:o};
                }
            }
            go=buff.length>0;
            this.debug>=SILLY&&console.log("Starting parse loop w/existing length ",l);
            while(go) {
                c = buff.slice(0,l).toString('utf8');
                this.debug>=SILLY&&console.log("Extracted data: ",c);
                // Push content as sentence piece.
                o.push(c);
                // If we detected end of sentence
                if (buff[l]===0) {
                    // then post new sentence.
                    this.debug>=DEBUG&&console.log('Detected end of sentence, posting existing sentence',o);
                    this.sentence$.next(o);
                    // Reset sentence buffer.
                    l++;
                    o=[];
                }
                this.debug>=SILLY&&console.log("Getting length",buff.slice(l));
                [buff,l] = decodeLength(buff.slice(l));
                this.debug>=SILLY&&console.log("Length",l);
                if (!l) {
                    this.debug>=DEBUG&&console.log('End of data, nothing left to process');
                    go=false;
                    return {b:Buffer.from([]),len:0,o:[]};
                }
                if (buff.length<l) {
                    this.debug>=DEBUG&&console.log("Buffer shorter than expected data, waiting for next packet.",{b:buff,len:l,o:o});
                    return {b:buff,len:l,o:o};
                }
            }
        },{b:Buffer.from([]),len:0,o:[]})
        .subscribe(e=>this.debug>=DEBUG&&console.log('Buffer leftover: ',e.len?e:'Empty'),closeSocket,closeSocket);


        this.socket.on('end',a => {
            this.debug>=INFO&&console.log('Connection end '+a);
            if (this.status==CONNECTED)
                // Completing the sentence closes all downstream observables and completes any subscriptions.
                this.sentence$.complete();
                // this.handler.close(true);
        });

        this.socket.on('error',a => {
            this.debug>=ERROR&&console.log('Connection error: '+a);
            // Erroring the sentence closes all downstream observables and issues error any subscriptions.
            this.sentence$.error(a);
        });

        this.setTimeout(timeout);

        // This is the function handler for error or complete for the parsing functions.
        const closeSocket=(e)=>{console.log("Closing Socket ",e);e?this.socket.destroy(e):this.socket.destroy();}
        /** Listen for complete on stream to dictate if socket will close */
        this.sentence$
            // .do(d=>console.log("Sentence: ",d))
            .subscribe(emptyFunction,closeSocket,closeSocket);

        // This will be called if there is no activity to the server.
        // If this occurs before the login is successful, it could be
        // that it is a connection timeout.
        this.socket.setKeepAlive(true); 
        this.b=[];
        this.len=0;
        this.line='';

    }

    setDebug(d) {
        this.debug>=DEBUG&&console.log('SocketStream::setDebug',[d]);
        this.debug=d;
    }

    setTimeout(timeout) {
        this.debug>=DEBUG&&console.log('SocketStream::setTimeout',[timeout]);
        this.socket.setTimeout(timeout*1000,e=>{ // the socket timed out. According to the NodeJS api docs, right after this, it will be._closed.
            if (this.status!==CONNECTED) {
                this.debug&&console.log('Socket Timeout');
                this.sentence$.error("Timeout: ",JSON.stringify(e));
                // self.emit('error','Timeout Connecting to host',self);
            }
        });

    }
    /** Connect the socket */
    connect(host,port,cb) {
        this.debug>=DEBUG&&console.log('SocketStream::Connect',[host,port,cb]);
        this.status=CONNECTING;
        this.socket.connect(port,host,(...args)=>{
            this.debug&&console.log('Socket Connected');
            this.status=CONNECTED;
            cb(...args);
        });
    }

    /** Provides access to all of the different stages of input streams and the write stream. */
    getStream() {
        return {sentence:this.sentence$,write:this.write,read:this.parsed$,raw:this.data$};
    }

    @autobind
    write(data) { // This shouldn't be called directly. Please use channels.
        this.debug>=MikroNode.DEBUG&&console.log('SocketStream::write',[data]);
        if (!this.socket||!(this.status&(CONNECTED|CONNECTING))) {
            this.debug>MikroNode.WARN&&console.log('write: not connected ');
            return;
        }
        if (typeof(data)===STRING_TYPE) data=[data];
        else if (!Array.isArray(data)) return;
        data.forEach(i => {
            try {
                this.debug>=MikroNode.DEBUG&&console.log('write: sending '+i);
                this.socket.write(encodeString(i,this.debug&MikroNode.SILLY));
            } catch(error) {
                this.sentence$.error(error);
            }
        });
        this.socket.write(nullString);
    }
}