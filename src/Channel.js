import util from 'util';
import events from 'events';
import {Observable, Subject, Scheduler} from 'rxjs';
import {DEBUG, CONNECTION, CHANNEL, EVENT} from './constants.js';
import {resultsToObj} from './Util.js';
// console.log2=console.log;
// console.log=function(...args) {
//     const stack=new Error().stack.split('\n');
//     const file = (stack[2].match(/\(([^:]+:\d+)/)||['',''])[1].split("/").pop()+": "+typeof args[0]==="string"?args.shift():'';
//     console.log2(file,...args);
// }
export default class Channel extends events.EventEmitter {

    /** ID of the channel. 
     * @private
     * @instance
     * @member {boolean} id
     * @memberof Channel
    **/
    @Private
    id;

    /** Current channel status. See Constants for list of channel status (CHANNEL)
     * @private
     * @instance
     * @member {boolean} id
     * @memberof Channel
    **/
    @Private
    status=CHANNEL.OPEN;

    /** ID of the channel. 
     * @private
     * @instance
     * @member {boolean} id
     * @memberof Channel
    **/
    @Private
    closed=false;

    /** In/Out stream object for this channel.
     * @private
     * @instance
     * @member {Object} stream
     * @memberof Channel
    **/
    @Private
    stream;

    /** Current Debug level for this channel.
     * @private
     * @instance
     * @member {int} debug
     * @memberof Channel
    **/
    @Private
    debug=DEBUG.NONE;

    /** If wether to call close on this channel when done event occurs. This only works if sync is true.
     * @private
     * @instance
     * @member {boolean} closeOnDone
     * @memberof Channel
    **/
    @Private
    closeOnDone=false;

    /** If wether to call close on this channel when trap event occurs.
     * @private
     * @instance
     * @member {boolean} closeOnTrap
     * @memberof Channel
    **/
    @Private
    closeOnTrap=false;

    /** The buffered stream. Used to hold all results until done or trap events occur.
     * @private
     * @instance
     * @member {Observable} bufferedStream
     * @memberof Channel
    **/
    @Private
    bufferedStream;

    /** "data stream" for this channel. no other sentences execpt data sentences get to this point.
     * @private
     * @instance
     * @member {Observable} data
     * @memberof Channel
    **/
    @Private
    data;

    /** contains all sentences for this stream
     * @private
     * @instance
     * @member {Observable} read
     * @memberof Channel
    **/
    @Private
    read;

    /** Trap stream
     * @private
     * @instance
     * @member {Observable} trap
     * @memberof Channel
    **/
    @Private
    trap;

    /** write stream
     * @private
     * @instance
     * @member {Subject} write
     * @memberof Channel
    **/
    @Private
    write=new Subject();

    /** If commands should be synchronous.
     * @private
     * @instance
     * @member {boolean} sync
     * @memberof Channel
    **/
    @Private
    sync=true;

    /** Data buffer per command execution
     * @private
     * @instance
     * @member {Object} buffer
     * @memberof Channel
    **/
    @Private
    dataBuffer = {};

    /** Command buffer. All output commands go through this buffer.
     * @private
     * @instance
     * @member {Array} buffer
     * @memberof Channel
    **/
    @Private
    buffer = [];

    /**
      * Command ID tracking.
      * @private
      * @instance
      * @member {Object} buffer
      * @memberof Channel
    **/
    @Private
    cmd = {count:0}
    /** 
      * Create new channel on a connection. This should not be called manually. Use Connection.openChannel
      * @constructor
      * @param {string|number} id - ID of the channel
      * @param {object} stream - stream object representing link to connection.

    **/
    constructor(id,stream,debug,closeOnDone) {
        super();
        this.debug=debug;
        this.debug&DEBUG.SILLY&&console.log('Channel::New',[].slice.call(arguments));
        this.closeOnDone=closeOnDone;
        if(this.status&(CHANNEL.CLOSING|CHANNEL.CLOSED)) return; // catch bad status
        const done=new Subject();
        const index=done
            .do(e=>{
                if (!e.cmd) return;
                delete this.cmd[e.id].p;
                delete this.cmd[e.id];
            })
            .subscribeOn(Scheduler.async)
            .scan((idx,i)=>++idx,0)
            .share(); // share the index result.

        this.stream=stream;
        this.id=id;
        this.read=stream.read.takeWhile(()=>!(this.status&CHANNEL.CLOSED))
            .flatMap(d=>{
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::Read flatMap',d);
                const pos=d.tag.split('-');
                const cmd=pos.pop();
                return Observable.of({...d,tag:pos.join('-'),cmd:this.cmd[cmd]});
            }).share()
            // .do(d=>{
            //     this.debug>=DEBUG.SILLY&&console.log('Channel (%s)::Event (%s)',id,e.type,e);
            // })
            // .share()
            ;

        this.data=new Subject();
        this.read
            .filter(e=>e.type===EVENT.DATA||e.type===EVENT.DONE_RET)
            // .do(e=>this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::DATA ',id,e))
            .subscribe(d=>{
                this.emit(EVENT.DATA,d.data);
                this.data.next(d);
                this.dataBuffer[d.cmd.id].push(d.data);
            })
            // .catch((...e)=>{
            //     console.error("Error in data read filter.",e);
            // })
            ;

        const doNext=(e)=>{
            const commandId=e.cmd?e.cmd.id:0;
            this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::doNext Resolving Done promise',id);
            if (commandId) delete this.dataBuffer[commandId];
            if (!this.buffer.length) {
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::Triggering Done',id);
                this.status=CHANNEL.DONE;
                if (this.sync&&this.closeOnDone) {
                    this.status=CHANNEL.CLOSING;
                    bufferedStreamSubject.complete();
                    this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::CLOSING',id);
                }
            }
            done.next(e);
        };
        this.read.filter(e=>e.type==EVENT.DONE_TAG||e.type==EVENT.DONE||e.type==EVENT.DONE_RET)
            .subscribe(e=>{
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::DONE Resolving Done promise',id);
                if (!e.cmd) {
                    return doNext(e);
                }
                const promise=e.cmd.p;
                const commandId = e.cmd.id;
                promise[2].then(doNext).catch(e=>{
                    console.log("Error in doNext",e);
                    this.status=CHANNEL.DONE;
                    if (this.sync&&this.closeOnDone) {
                        this.status=CHANNEL.CLOSING;
                        this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::CLOSING',id);
                        bufferedStreamSubject.complete();
                        done.complete();
                    }
                    done.next(e);
                });
                // if (!(this.status&CHANNEL.CLOSING)) {
                const data={...e,cmd:e.cmd.cmd,data:(e.data||[]).concat(this.dataBuffer[commandId]),id:e.cmd.id};
                bufferedStreamSubject.next(data);
                promise[0](data);
                // }
            },e=>{
                console.error("Error in done read filter."+e);
            },e=>{
                bufferedStreamSubject.complete();
            });
        this.trap=this.read.filter(e=>e.type==EVENT.TRAP||e.type===EVENT.TRAP_TAG).share();
        this.trap.subscribe(e=>{
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::TRAP Rejecting Done promise',id);
                if (this.closeOnTrap||this.status&CHANNEL.CLOSING&&!this.buffer.length) {
                    this.status=CHANNEL.CLOSING;
                    this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSING',id);
                    done.complete();
                    bufferedStreamSubject.complete();
                    this.close();
                }
                // e.cmd.p[2].catch(e=>done.next("go")); // execute next after catch completes. // done happens after catch.
                // done.next("go");
                e.cmd.p[1](resultsToObj(e).message); 
            },(...e)=>{
                console.error("Error in trap read filter.",e);
            });
        this.read.filter(e=>e.type==EVENT.FATAL)
            .subscribe(e=>{
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::FAIL Rejecting Done promise',id);
                e.cmd.p[2].catch(()=>done.next(e)); // execute next after catch completes.
                e.cmd.p[1](resultsToObj(e));
                this.status=CHANNEL.CLOSED;
                this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSING',id);
                done.next(e);
                done.complete();
                this.close();
            },(...e)=>{
                console.error("Error in fatal read filter.",e);
            });

        const bufferedStreamSubject=new Subject();

        this.bufferedStream=bufferedStreamSubject.share();

        // const bufferedStream=this.data
        //     .buffer(index)
        //     // .do(e=>{
        //     //     this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::BUFFERED (%s)',id,e.type,e);
        //     // })
        //     .map(d=>({id:id,tag:d[0]?d[0]["tag"]:id,cmd:d[0]?d[0]["cmd"]:null,type:EVENT.DONE,data:d.map(d=>d.data)}))
        //     .share();
        
        // bufferedStream
        //     .subscribe(buffer=>{
        //         this.debug>=DEBUG.INFO&&console.log('Channel(%s)::DONE',id);
        //         this.emit(EVENT.DONE,buffer);
        //         // Check command buffer, if it has items, flush them.
        //         if (this.buffer.length==0&&((this.status&CHANNEL.CLOSING)||(this.sync&&this.closeOnDone)||this.stream.done())) {
        //             this.debug>=DEBUG.SILLY&&console.log("Channel (%s) closing",id);
        //             this.close();
        //         }
        //     },e=>{
        //         console.error("Error in buffered data read filter.",e);
        //     },()=>bufferedStreamSubject.complete());

        index.flatMapTo(Observable.using(
                ()=>this.buffer
              , (r)=>{
                    if (this.sync) {
                        if (this.buffer.length) {
                            this.debug>=DEBUG.INFO&&console.log("Channel %s: Pulling next item from write buffer ",this.id,this.buffer[0]);
                            return Observable.of(this.buffer.shift());
                        } else {
                            const t=this.write.take(1);
                            this.debug>=DEBUG.INFO&&console.log("Channel %s: Pulling next item from write stream ",this.id,t);
                            return t;
                        }
                    } else {
                        // this.debug>=DEBUG.INFO&&console.log("Channel %s: Returning whole write stream ",this.id,this.write);
                        // return this.write;
                    }
                }
            )
        )
        .subscribe(([d,args,cmdCount])=>{
            this.status=CHANNEL.RUNNING;
            this.debug>=DEBUG.INFO&&console.log("Writing on channel %s",this.id,d,args);
            this.dataBuffer[cmdCount]=[];
            this.stream.write(d,args,cmdCount);
            return this;
        });

        this.write.subscribe(([d,args,cmdCount])=>{
            if (this.status&CHANNEL.RUNNING && this.sync) {
                this.debug>=DEBUG.INFO&&console.log("Buffering write on channel %s",this.id,d,args);
                this.buffer.push([d,args,cmdCount]);
            } else {
                this.dataBuffer[cmdCount]=[];
                this.status=CHANNEL.RUNNING;
                this.debug>=DEBUG.INFO&&console.log("Writing on channel %s",this.id,d,args);
                this.stream.write(d,args,cmdCount);
            }
        });
    }

    write(d,args) {
        if (this.status&(CHANNEL.CLOSED|CHANNEL.CLOSING)) {
            this.debug>=DEBUG.WARN&&console.error("Cannot write on closed or closing channel");
            return this;
        }
        const p = new Promise((res,rej)=>{
            this.cmd[++this.cmd.count]={cmd:[d,args],p:[res.bind(this),rej.bind(this)]};
        });
        const commandId=this.cmd.count;
        p.catch(e=>{
            // console.log("**** Caught error in promise, clearing CMD");
            this.debug>=DEBUG.WARN&&console.log("Catching error: ",this.cmd.count);
            delete this.cmd[commandId];
        });
        this.cmd[commandId].p.push(p);
        this.cmd[commandId].id=commandId;
        this.write.next([d,args,commandId]);
        return p;
    }

    // status() { return this.status }
    close(force) { 
        if (this.status&CHANNEL.RUNNING) {
            if (force) this.stream.write('/cancel');
            // else this.write('/cancel');
            this.closeOnDone=true;
            this.sync=true;
            this.status=CHANNEL.CLOSING;
            return;
        }
        if (this.status&CHANNEL.CLOSED) return;
        this.status=CHANNEL.CLOSED;
        this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSED',this.id);
        this.stream.close();
        this.removeAllListeners(EVENT.DONE);
        this.removeAllListeners(EVENT.DATA);
        this.removeAllListeners(EVENT.TRAP);
    }
    // Enforce read-only

    /** Data stream returns each sentence from the device as it is received. **/
    get data() {
        return this.data;
    }

    /** Done stream buffers every sentence and returns all sentences at once.
        Don't use this stream when "listen"ing to data. done never comes.
        A trap signals the end of the data of a listen command.
     **/
    get done() {
        return this.bufferedStream;
    }

    /** When a trap occurs, the trap sentence flows through this stream **/
    get trap() {
        // TRAP_TAG is the only one that *should* make it here.
        return this.trap;
    }

    /** This is the raw stream. Everything for this channel comes through here. **/
    get stream() {
        return this.read;
    }

    get status() {
        return this.status;
    }

    /* Commands are sent to the device in a synchronous manor. This is enabled by default. */
    sync(...args) {
        if (args.length) {
            this.sync=!!args[0];
            return this;
        }
        return this.sync;
    }

    pipeFrom(stream$) {
        if (this.status&(CHANNEL.DONE|CHANNEL.OPEN)) {
            this.status=CHANNEL.RUNNING;
            stream$.subscribe(
                d=>this.write(d),
                ()=>{
                    this.status=CHANNEL.DONE;
                    this.stream.done();
                },
                ()=>{
                    this.status=CHANNEL.DONE;
                    this.stream.done();
                }
            );
        }
    }
    getId(){return this.id}

    /** When the done sentence arrives, close the channel. This only works in synchronous mode. **/
    closeOnDone(...args) { 
        if (args.length)
            this.closeOnDone=!!args[0];
        else this.closeOnDone;
        return this;
    }

    /** If trap occurs, consider it closed. **/
    closeOnTrap(...args)  {
        if (args.length)
            this.closeOnTrap=!!args[0];
        else return this.closeOnTrap;
        return this;
    }

}
