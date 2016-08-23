import util from 'util';
import events from 'events';
import {Observable, Subject, Scheduler} from 'rxjs';
import {DEBUG, CONNECTION, CHANNEL, EVENT} from './constants.js';

export default class Channel extends events.EventEmitter {

    @Private
    id;

    @Private
    status=CHANNEL.OPEN;

    @Private
    closed=false;

    @Private
    stream;

    @Private
    debug=DEBUG.NONE;

    @Private
    closeOnDone=false;

    @Private
    closeOnTrap=false;

    @Private
    bufferedStream;

    @Private
    data;

    @Private
    read;

    constructor(id,stream,debug,closeOnDone) {
        super();
        this.debug=debug;
        this.debug&DEBUG.SILLY&&console.log('Channel::New');
        this.closeOnDone=closeOnDone;
        // if(this.status&(CHANNEL.CLOSING|CHANNEL.CLOSED)) return;
        const done=new Subject();
        const index=done.observeOn(Scheduler.async).scan((idx,i)=>++idx,0).take(1);
        this.stream=stream;
        this.id=id;
        this.read=stream.read.takeWhile(()=>!(this.status&(CHANNEL.CLOSING|CHANNEL.CLOSED)))
            .do(e=>{
                if (e.type==EVENT.DONE_TAG||e.type==EVENT.DONE||e.type==EVENT.DONE_RET) {
                    this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::Triggering Done',id);
                    this.status=CHANNEL.DONE;
                    if (this.closeOnDone) {
                        this.status=CHANNEL.CLOSING;
                        this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::CLOSING',id);
                    }
                    done.next("go");
                } else
                if (e.type==EVENT.FATAL) {
                    this.status=CHANNEL.CLOSED;
                    this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSING',id);
                    this.close();
                }
            });

        this.data=this.read
            .do(e=>this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::DATA ',id,e))
            .filter(e=>e.type===EVENT.DATA||e.type===EVENT.DONE_RET)
            .map(e=>e.data)
            .do(data=>this.emit(EVENT.DATA,data));

        this.bufferedStream=this.data
            .buffer(index)
            .withLatestFrom(index,(buffer,index)=>([buffer,index]));

        this.bufferedStream
            .subscribe(([buffer,index])=>{
                this.debug>=DEBUG.INFO&&console.log('Channel(%s)::DONE (%s)',id,index);
                this.emit(EVENT.DONE,buffer,index);
                if (this.status&CHANNEL.CLOSING||this.stream.done()) {
                    this.debug>=DEBUG.SILLY&&console.log("Channel (%s) closing",id);
                    this.close();
                }
            });
    }

    // status() { return this.status }
    close() { 
        if (this.status==CHANNEL.CLOSED) return;
        this.status=CHANNEL.CLOSED;
        this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSED',this.id);
        this.stream.close();
        this.removeAllListeners(EVENT.DONE);
        this.removeAllListeners(EVENT.DATA);
        this.removeAllListeners(EVENT.TRAP);
    }
    // Enfore read-only
    get data() {
        return this.data;
    }

    get bufferedStream() {
        return this.bufferedStream;
    }

    get trap() {
        return this.read.filter(e=>e.type===EVENT.TRAP||e.type===);
    }

    /** Return the incoming read stream */
    get stream() {
        return this.read;
    }

    get status() {
        return this.status;
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
    write(d) {
        if (this.status&(CHANNEL.CLOSED|CHANNEL.CLOSING)) {
            this.status>=DEBUG.WARN&&console.log("Cannot write on closed or closing channel");
            return;
        }
        this.status=CHANNEL.RUNNING;
        this.debug>=DEBUG.INFO&&console.log("Writing on channel %s",this.id,d);
        this.stream.write(d);
        return this;
    }

    getId(){return this.id}
    closeOnDone(b) { return typeof(b)=='boolean'?this.closeOnDone=b:this.closeOnDone; }

    // If trap occurs, consider shit closed.
    closeOnTrap(b)  { return typeof(b)=='boolean'?this.closeOnTrap=b:this.closeOnTrap; }
    // clearEvents(b) { return typeof(b)=='boolean'?this.clearEvents=b:this.clearEvents; }

}