import util from 'util';
import events from 'events';
import {Observable, Subject} from 'rxjs';

const emptyFunction=()=>{};
const STRING_TYPE=typeof "";
const ERROR=1;
const WARN=2;
const INFO=4;
const DEBUG=8;
const SILLY=16;

export default class Channel extends events.EventEmitter {

    @Private
    id;

    @Private
    status=Channel.OPEN;

    @Private
    closed=false;

    @Private
    stream;

    @Private
    debug=Channel.NONE;

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
    static NONE=0;
    static OPEN = 1;
    static CLOSED = 2;
    static CLOSING = 4;
    static RUNNING = 8;
    static DONE=16;

    constructor(id,stream,debug,closeOnDone) {
        super();
        this.debug=debug;
        this.debug&SILLY&&console.log('Channel::New');
        this.closeOnDone=closeOnDone;
        // if(this.status&(Channel.CLOSING|Channel.CLOSED)) return;
        const done=new Subject();
        const index=done.scan((idx,i)=>++idx,0);
        this.stream=stream;
        this.id=id;
        this.read=stream.read.takeWhile(()=>!(this.status&(Channel.CLOSING|Channel.CLOSED)))
            .do(e=>{
                if (e.type==='data') {
                    this.debug>=DEBUG&&console.log('Channel (%s)::DATA ',id,e);
                    this.emit('data',e.data);
                } 
                if (e.type=='done_tag'||e.type=='done') {
                    this.debug>=DEBUG&&console.log('Channel (%s)::Triggering Done',id);
                    this.status=Channel.DONE;
                    if (this.closeOnDone) {
                        this.status=Channel.CLOSING;
                        this.debug>=DEBUG&&console.log('Channel::CLOSING');
                    }
                    done.next("go");
                }
                if (e.type=='fatal') {
                    this.status=Channel.CLOSED;
                    this.debug>=DEBUG&&console.log('Channel::CLOSING');
                    this.close();
                }
            });

        this.data = this.read.filter(e=>e.type==='data').map(e=>e.data);

        this.bufferedStream=this.data
            .buffer(index)
            .combineLatest(index,(buffer,index)=>([buffer,index]));

        this.bufferedStream
            .subscribe(([buffer,index])=>{
                this.debug>=INFO&&console.log('Channel(%s)::DONE (%s)',id,index);
                this.emit('done',buffer,index);
                if (this.status&Channel.CLOSING||this.stream.done()) {
                    this.close();
                }
            });
    }

    // status() { return this.status }
    close() { 
        this.status=Channel.CLOSED;
        this.debug>=INFO&&console.log('Channel::CLOSED');
        this.stream.close();
        this.removeAllListeners('done');
        this.removeAllListeners('data');
        this.removeAllListeners('read');
    }
    // Enfore read-only
    get data { return this.data }
    get bufferedStream { return this.bufferedStream }
    pipeFrom(stream$) {
        if (this.status&(Channel.DONE|Channel.OPEN)) {
            this.status=Channel.RUNNING;
            stream$.subscribe(
                d=>this.write(d),
                ()=>{
                    this.status=Channel.DONE;
                    this.stream.done();
                },
                ()=>{
                    this.status=Channel.DONE;
                    this.stream.done();
                }
            );
        }
    }
    write(d) {
        if (this.status&(Channel.CLOSED|Channel.CLOSING)) {
            this.status>=WARN&&console.log("Cannot write on closed or closing channel");
            return;
        }
        this.status=Channel.RUNNING;
        this.debug>=INFO&&console.log("Writing on channel %s",this.id,d);
        this.debug>=INFO&&console.log(this.status);
        this.stream.write(d);
        return this;
    }

    /** Return the incoming read stream */
    get stream { return this.read }
    getId(){return this.id}
    closeOnDone(b) { return typeof(b)=='boolean'?this.closeOnDone=b:this.closeOnDone; }

    // If trap occurs, consider shit closed.
    closeOnTrap(b)  { return typeof(b)=='boolean'?this.closeOnTrap=b:this.closeOnTrap; }
    // clearEvents(b) { return typeof(b)=='boolean'?this.clearEvents=b:this.clearEvents; }

}