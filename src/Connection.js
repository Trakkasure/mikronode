import {autobind} from 'core-decorators';
import util from 'util';
import events from 'events';
import {Subject, Observable} from 'rxjs';
import Channel from './Channel';

const emptyString=String.fromCharCode(0);
const STRING_TYPE=typeof "";
const emptyFunction=()=>{};
const NONE=0;
const ERROR=1;
const WARN=2;
const INFO=4;
const DEBUG=8;
const SILLY=16;


export default class Connection extends events.EventEmitter {

    static EVENTS = {
        TRAP: 'trap'
      , TRAP_TAG: 'trap_tag'
      , DONE: 'done'
      , DONE_RET: 'done_ret'
      , FATAL: 'fatal'
      , FATAL_TAG: 'fatal_tag'
      , TAG: 'tag'
      , DONE_RET_TAG: 'done_ret_tag'
      , DONE_TAG: 'done_tag'
    };

    static DISCONNECTED="Disconnected";// Disconnected from device
                         // ERROR defined above means a connect or transport error.
    static ERROR="Error";
    static CONNECTING="Connecting";  // Connecting to device
    static CONNECTED="Connected";   // Connected and idle
    static WAITING="Waiting";     // Waiting for response(s)
    static CLOSING="Closing";
    static CLOSED="Closed";

    @Private
    status=NONE;

    @Private
    channels={};

    @Private
    stream;

    @Private
    debug=NONE;

    constructor(stream,loginHandler,p) {
        super();
        const login=stream.read
            // .do(d=>console.log("Sentence: ",d))
            .takeWhile(o=>this.status!==Connection.CONNECTED);

        this.stream=stream;

        login.filter(d=>d.type===Connection.EVENTS.TRAP)
             .subscribe(trap=>{
                this.emit('trap',trap.data)
                this.close();
             });

        login.filter(d=>d.type===Connection.EVENTS.DONE_RET)
             .subscribe(data=>{
                this.status=Connection.CONNECTING;
                this.debug>=DEBUG&&console.log("Got done_ret, building response to ",data);
                var a=data.id.split('');
                var challenge=[];
                while(a.length) challenge.push(parseInt("0x"+a.shift()+a.shift()));
                this.debug>=DEBUG&&console.log('Challenge length:'+challenge.length);
                if (challenge.length!=16) {
                    this.status=Connection.ERROR;
                    this.debug>=WARN&&console.log(this.status);
                    stream.sentence.error('Bad Connection Response: '+data);
                } else {
                    loginHandler(challenge);
                }
             });

        login.filter(d=>d.type===Connection.EVENTS.DONE)
             .subscribe(d=>{
                this.status=Connection.CONNECTED;
                this.debug&&console.log('Connected');
                p.resolve(this);
              },
              e=>{
                this.debug&&console.log('Error in connection: '+e);
                p.reject(e);
              },
              ()=>{
                this.debug>=DEBUG&&console.log("Login stream complete");
              }
             );

        stream.read.subscribe(null,null,e=>{this.channels.forEach(c=>c.complete())});
    }

    close() {
      console.log("Closing connection through stream");
      this.stream.close();
    }

    setDebug(d) {
      this.debug=d;
    }

    /** If all channels are closed, close this connection */
    closeOnDone(b) {
      this.closeOnDone=b;
    }

    getChannel(id) {
      return this.channels[id];
    }
    openChannel(id,closeOnDone=false) {
        this.debug>=SILLY&&console.log("Connection::OpenChannel");
        if (!id) {
            id=Object.keys(this.channels).length+1;
            while (this.channels[id]) id++;
        } else {
            if (this.channels[id]) throw('Channel already exists for ID '+id);
        }
        this.debug>=SILLY&&console.log("Creating proxy stream");
        let s = {
          "read": this.stream.read.filter(e=>e.id==id),
          "write": (d) => {
            if (typeof(d)===STRING_TYPE)
              d=d.split("\n");
            if (Array.isArray(d)&&d.length) {
              d.push('.tag='+id);
              this.stream.write(d);
            }
            else return;
          },
          "close": ()=>{
            this.debug>=Connection.DEBUG&&console.log("Closing channel ",id);
            delete this.channels[id];
          },
          "done": ()=>{
            this.debug>=Connection.DEBUG&&console.log("Channel done (%s)",id);
            if (this.closeOnDone) {
              if (Object.keys(this.channels).length==1) {
                this.channels={};
                this.close();
              } else {
                if (!Object.keys(this.channels).filter(i=>this.channels[i].status()&(Channel.OPEN|Channel.RUNNING)).length) {
                  Object.keys(this.channels).filter(i=>this.channels[i].status()&(Channel.DONE)).forEach(i=>this.channels[i].close())
                }
              }
              return true;
            }
            return false;
          }
        };
        this.debug>=INFO&&console.log("Creating channel ",id);
        this.channels[id]=new Channel(id,s,this.debug,closeOnDone);
        return this.channels[id];
    }
}