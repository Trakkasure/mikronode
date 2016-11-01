import util from 'util';
import events from 'events';
import {Subject, Observable} from 'rxjs';
import {autobind} from 'core-decorators';
import {STRING_TYPE, DEBUG, CONNECTION, CHANNEL, EVENT} from './constants.js';
import Channel from './Channel';

export default class Connection extends events.EventEmitter {

    @Private
    status=CONNECTION.NONE;

    @Private
    channels=[];

    @Private
    stream;

    @Private
    debug=DEBUG.NONE;

    @Private
    closeOnDone=false;

    constructor(stream,loginHandler,p) {
        super();
        const login=stream.read
            // .do(d=>console.log("Sentence: ",d))
            .takeWhile(o=>this.status!==CONNECTION.CONNECTED).share();

        this.stream=stream;

        const rejectAndClose = d=>{
            p.reject(d);
            this.close();
        };

        login.filter(d=>d.type===EVENT.TRAP)
             .do(t=> {
                this.emit('trap',t.data)
                this.debug&&console.log('Trap during login: ',t.data);
              }).map(t=>t.data)
             .subscribe(rejectAndClose,rejectAndClose);

        login.filter(d=>d.type===EVENT.DONE_RET)
             .subscribe(data=>{
                this.status=CONNECTION.CONNECTING;
                this.debug>=DEBUG.DEBUG&&console.log("Got done_ret, building response to ",data);
                var a=data.data.split('');
                var challenge=[];
                while(a.length) challenge.push(parseInt("0x"+a.shift()+a.shift()));
                this.debug>=DEBUG.DEBUG&&console.log('Challenge length:'+challenge.length);
                if (challenge.length!=16) {
                    this.status=CONNECTION.ERROR;
                    this.debug>=DEBUG.WARN&&console.log(this.status);
                    stream.sentence.error('Bad Connection Response: '+data);
                } else {
                    loginHandler(challenge);
                }
             });

        login.filter(d=>d.type===EVENT.DONE)
             .subscribe(d=>{
                this.status=CONNECTION.CONNECTED;
                this.debug>=DEBUG.INFO&&console.log('Connected');
                p.resolve(this);
              },
              rejectAndClose,
              ()=>{
                this.debug>=DEBUG.DEBUG&&console.log("Login stream complete");
              }
             );

        stream.read.subscribe(null,null,e=>this.channels.forEach(c=>c.complete()));
    }

    close() {
      this.debug>=DEBUG.SILLY&&console.log("Closing connection through stream");
      this.stream.close();
    }

    setDebug(d) {
      this.debug=d;
      return this;
    }

    /** If all channels are closed, close this connection */
    closeOnDone(b) {
      if (b) 
        this.closeOnDone=b;
      else return this.closeOnDone;
      return this;
    }

    getChannel(id) {
      return this.channels.filter(c=>c.getId()==id)[0];
    }

    @autobind
    openChannel(id,closeOnDone=false) {
        this.debug>=DEBUG.SILLY&&console.log("Connection::OpenChannel");
        if (!id) {
            id=+(new Date());
        } else {
            if (this.channels.some(c=>c.getId()===id)) throw('Channel already exists for ID '+id);
        }
        this.debug>=DEBUG.SILLY&&console.log("Creating proxy stream");
        let s = {
          "read": this.stream.read
                      .filter(e=>e.tag==id),
          "write": (d,args) => {
              if (typeof(d)===STRING_TYPE)
                d=d.split("\n");
              if (Array.isArray(d)&&d.length) {
                d.push('.tag='+id);
                return this.stream.write(d,args);
              }
              else return;
          },
          "close": ()=>{
              var channel=this.getChannel(id);
              if (channel) {
                this.debug>=DEBUG.DEBUG&&console.log("Closing channel ",id);
                this.channels.splice(this.channels.indexOf(channel),1);
                if (this.channels.length==0 && this.closeOnDone) this.close(); 
              } else
                this.debug>=DEBUG.WARN&&console.log("Could not find channel %s when trying to close",id);
          },
          "done": ()=>{
              this.debug>=DEBUG.DEBUG&&console.log("Channel done (%s)",id);
              // If Connection closeOnDone, then check if all channels are done.
              if (this.closeOnDone) {
                  const cl=this.channels.filter(c=>c.status&(Channel.OPEN|Channel.RUNNING));
                  if (cl.length) return false;
                  this.channels.filter(c=>c.status&(Channel.DONE)).forEach(c=>console.log("Closing...",c));
                  return true;
              }
              return false;
          }
        };
        var c;
        this.debug>=DEBUG.INFO&&console.log("Creating channel ",id);
        this.channels.push((c=new Channel(id,s,this.debug,closeOnDone)));
        return  c;
    }
}