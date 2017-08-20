import util from 'util';
import events from 'events';
import {Observable, Subject, Scheduler} from 'rxjs';
import {DEBUG, CONNECTION, CHANNEL, EVENT} from './constants.js';
import {resultsToObj,getUnwrappedPromise} from './Util.js';
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

    /** If whether to call close on this channel when done event occurs, and there are no commands in the queue to run.
     * @private
     * @instance
     * @member {boolean} closeOnDone
     * @memberof Channel
    **/
    @Private
    closeOnDone=true;

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
     */
    @Private
    buffer = [];

    @Private
    cmdCount = 0;

    /**
      * Command ID tracking.
      * @private
      * @instance
      * @member {Object}
      * @memberof Channel
      */
    @Private
    cmd = {};

    @Private
    done;
    /** 
      * Create new channel on a connection. This should not be called manually. Use Connection.openChannel
      * @constructor
      * @param {string|number} id ID of the channel
      * @param {object} stream stream object representing link to connection.
      * @param {number} debug The debug level.
      * @param {boolean} closeOnDone If the channel should close itself when the next done event occurs, and there are no more commands to run.
      */
    constructor(id,stream,debug,closeOnDone) {
        super();
        this.debug=debug;
        this.debug&DEBUG.SILLY&&console.log('Channel::New',[].slice.call(arguments));
        this.closeOnDone=(typeof closeOnDone===typeof true)?closeOnDone:this.closeOnDone;
        this.id=id; // hold a copy.

        if(this.status&(CHANNEL.CLOSING|CHANNEL.CLOSED)) return; // catch bad status

        this.stream = stream; // Hold a copy
        // Stream for reading everything.
        this.read = stream.read.takeWhile(data=>!(this.status&CHANNEL.CLOSED))
            .do(e=>this.debug>=DEBUG.SILLY&&console.log('Channel (%s)::%s Sentence on channel ',e.tag))
            .flatMap(data=>{
                const cmd=this.getCommandId(data);
                return Observable.of({...data,tag:data.tag.substring(0,data.tag.lastIndexOf('-')),cmd:(this.getCommand(cmd)||{cmd:null}).cmd});
            }).share();
        // Stream for sentences with data.
        this.data = this.createStream(this.read,[EVENT.DATA,EVENT.DONE_RET]).share();
        // Stream for signaling when done.
        this.done = this.createStream(this.read,[EVENT.DONE,EVENT.DONE_RET,EVENT.DONE_TAG]).share();

        // Stream for all traps from device.
        this.trap=this.read.filter(e=>e.type==EVENT.TRAP||e.type===EVENT.TRAP_TAG)
        .do(e=>this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::TRAP ',id))
        .share();
        // this.trap.subscribe(e=>{
            // if (this.closeOnTrap||this.status&CHANNEL.CLOSING) {
            //     this.status=CHANNEL.CLOSING;
            //     this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSING',id);
            //     this.close();
            // }
        // });
        this.read.filter(e=>e.type==EVENT.FATAL)
            .subscribe(e=>{
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::FATAL ',id);
                this.status=CHANNEL.CLOSING;
                this.close();
            });
        this.bufferedStream=new Subject();
    }

    /**
     * 
     * @param {string} command The command to write to the device on this channel.
     * @param {*} args Arguments to pass as part of the command.
     */
    write(command,args=[]) {
        if (this.status&(CHANNEL.CLOSED|CHANNEL.CLOSING)) {
            this.debug>=DEBUG.WARN&&console.error("Cannot write on closed or closing channel");
            return this;
        }
        const {promise,resolve,reject}=getUnwrappedPromise();

        promise.resolve=resolve;
        promise.reject=reject;
        // Add the command to the registry.
        const cmd=this.registerCommand(command,args,promise);
        const commandId=cmd.id;
        promise.cmd=cmd;

        if ((Object.keys(this.cmd).length-1)==0 && !(this.sync&&this.status&CHANNEL.RUNNING)) {
                // console.log("There are no commands in the buffer, but channel is in running state while sync enabled.");
            this.status=CHANNEL.RUNNING;
            this.debug>=DEBUG.INFO&&console.log("Writing on channel %s",this.id,command,args);
            this.stream.write(command,args,commandId);
        } else {
            const last=this.lastCommand(commandId);
            // If we are in sync mode, wait until the command is complete
            if (this.sync) last.promise.then(()=>{
                this.status=CHANNEL.RUNNING;
                this.stream.write(command,args,commandId);
            },()=>{
                if (this.closeOnTrap) {
                    this.status=CHANNEL.CLOSING;
                    return;
                }
                if (this.status&CHANNEL.CLOSING) return;
                this.status=CHANNEL.RUNNING;
                this.stream.write(command,args,commandId);
            });
            // Otherwise since the last command was sent, we can send this one now.
            else {
                this.status=CHANNEL.RUNNING;
                this.stream.write(command,args,commandId);
            }
        }

        promise.then((e)=>{
            // If we want to close on done, and there are no commands waiting to run
            this.status=CHANNEL.DONE;
            if (!Object.keys(this.cmd).length) {
                if (this.closeOnDone) this.close();
            }
        });
        // Collapsing on error...
        promise.catch(e=>{
            this.status=CHANNEL.DONE;
            if (this.closeOnTrap) {
                this.status=CHANNEL.CLOSING;
                this.debug>=DEBUG.DEBUG&&console.log('Channel (%s):: read-done catch CLOSING',this.id);
            }
        });
        return promise;
    }

    /**
     * Clear the command from cache
     * @param {number} commandId 
     */
    @Private
    clearCommand(commandId) {
        if (typeof commandId === typeof {}) {
            if (commandId.cmd)
                return this.clearCommand(commandId.cmd.id);
            if (commandId.id)
                return this.clearCommand(commandId.id);
            return null;
        }
        const cmd = this.cmd[commandId];
        if (!cmd) return;
        delete cmd.promise.resolve;
        delete cmd.promise.reject;
        delete cmd.promise;
        delete this.cmd[commandId];
    }
    /**
     * Get the last command relative to the commandId
     * @param {number} commandId 
     */
    @Private
    lastCommand(commandId) {
        return this.cmd[commandId-1];
    }

    @Private
    getCommand(commandId) {
        if (!commandId) return null;
        if (typeof commandId===typeof {}) {
            if (commandId.cmd) return commandId.cmd;
            else return null;
        }
        return this.cmd[commandId];
    }

    /**
     * 
     * @param {string} command Command to send to device
     * @param {array} args Arguments for command
     * @param {object} promise object containing resolve and reject functions.
     */
    @Private
    registerCommand(command,args,promise) {
        this.cmdCount=this.cmdCount+1;
        const commandId=this.cmdCount;
        this.cmd[commandId]={id:commandId,cmd:{id:commandId,command,args},promise};
        (function(id,p){
            const race = Observable.race(
                this.done
                    .filter(
                        data=>data.cmd&&data.cmd.id===id
                    )
                    // .do(
                    //     d=>console.log("*** Done in %s:%s",d.cmd.id,id)
                    // )
                    .take(1)
              , this.trap
                    .filter(
                        data=>data.cmd&&data.cmd.id===id
                    )
                    // .do(
                    //     d=>console.log("*** Trap in %s:%s",d.cmd.id,id)
                    // )
                    .take(1)
            ).take(1);

            race.partition(data=>data.type==EVENT.TRAP||data.type===EVENT.TRAP_TAG)
            .reduce((r,o,i)=>{
                if (i==0) {
                    o.subscribe(error=>{
                        this.debug>=DEBUG.SILLY&&console.error("*** Register Command: trap",id,error);
                        p.reject(error);
                    });
                } else
                return o;
            },{})

            const data=this.data
                .filter(data=>data.cmd.id===id)
                .takeUntil(race)
                .do(d=>this.debug>=DEBUG.SILLY&&console.log("*** Data in %s:%s",d.cmd.id,id))
                .reduce((acc,d)=>{
                    if (d.data) acc.data=acc.data.concat([d.data]);
                    return acc;
                },{cmd:this.cmd[id].cmd,tag:this.id,data:[]})
                .do(d=>this.debug>=DEBUG.SILLY&&console.log("*** Reduced Data in ",d))
                .takeUntil(race.filter(data=>data.type==EVENT.TRAP||data.type===EVENT.TRAP_TAG))
                .subscribe(data=>{
                    this.debug>=DEBUG.SILLY&&console.log("*** Register Command: subscribe",id,data);
                    this.status=CHANNEL.DONE;
                    this.bufferedStream.next(data);
                    p.resolve(data);
                },
                error=>{
                    this.debug>=DEBUG.SILLY&&console.error("*** Register Command: error",id,error);
                },
                ()=>{
                    this.debug>=DEBUG.SILLY&&console.log("*** Register Command: complete");
                    this.clearCommand(id);
                });
        }.bind(this))(commandId,promise);
        return this.cmd[commandId].cmd;
    }

    /**
     * Create a stream filtered by list of event types.
     * @param {Observable} stream The stream representing the incoming data
     * @param {Array} events list of events to filter by
     * @return {Observable} The incoming stream filtered to only the packets having data.
     */
    createStream(stream,events) {
        return this.read
                   .filter(e=>events.indexOf(e.type)!=-1)
                   .do(e=>this.debug>=DEBUG.DEBUG&&console.log('Channel (%s)::%s flatMap',e.tag,e.type))
                   .flatMap(d=>{
                       return Observable.of(d);
                       // this.dataBuffer[d.cmd.id].push(d.data);
                   });
    }
    /**
     * 
     * @param {Object} data Sentence object from read stream
     * @return {String} Command ID of sentence.
     */
    getCommandId(data) {
        if (!data) return null;
        if (typeof data === typeof {})
            return this.getCommandId(data.tag);
        return data.substring(data.lastIndexOf('-')+1);
    }

    // status() { return this.status }
    close(force) { 
        if (this.status&CHANNEL.RUNNING) {
            if (force) this.stream.write('/cancel');
            this.closeOnDone=true;
            this.sync=true;
            this.status=CHANNEL.CLOSING;
            return;
        }
        if (this.status&CHANNEL.CLOSED) return;
        this.status=CHANNEL.CLOSED;
        this.debug>=DEBUG.INFO&&console.log('Channel (%s)::CLOSED',this.id);
        this.bufferedStream.complete();
        this.stream.close();
        this.removeAllListeners(EVENT.DONE);
        this.removeAllListeners(EVENT.DATA);
        this.removeAllListeners(EVENT.TRAP);
    }

    /** Data stream returns each sentence from the device as it is received. **/
    get data() {
        return this.data;
    }

    /** Done stream buffers every sentence and returns all sentences at once.
        Don't use this stream when "listen"ing to data. Done never comes on a watch/listen command.
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

    /**
     * Get the current status of this channel.
     * @return The status code
     */
    get status() {
        return this.status;
    }

    /**
     * Commands are sent to the device in a synchronous manor. This is enabled by default.
     * @param {sync} sync If passed, this sets the value of sync.
     * @return If sync parameter is not passed, the value of sync is returned. Otherwise this channel object is returned.
     */
    sync(...args) {
        if (args.length) {
            this.sync=!!args[0];
            return this;
        }
        return this.sync;
    }

    /**
     * 
     * @param {Observable} stream Take incoming commands to write to this channel from the provided stream. The channel will stop taking commands if a fatal error occurs, or if the channel is closing or closed.
     * 
     */
    pipeFrom(stream) {
        if (this.status&(CHANNEL.DONE|CHANNEL.OPEN)) {
            this.status=CHANNEL.RUNNING;
            stream.takeWhile(o=>!(this.status&(CHANNEL.FATAL|CHANNEL.CLOSING|CHANNEL.CLOSED))).subscribe(
                d=>this.write(d),
                ()=>{
                    this.status=CHANNEL.DONE;
                    this.stream.close();
                },
                ()=>{
                    this.status=CHANNEL.DONE;
                    this.stream.close();
                }
            );
        }
    }

    getId(){return this.id}

    on(event,func) {
        const ret=super.on(event,func);
        setupEventSubscription(event,getStreamByEventType(event));
        return ret;
    }

    addEventListener(event,func) {
        const ret=super.addEventListener(event,func);
        setupEventSubscription(event,getStreamByEventType(event));
        return ret;
    }

    once(event,func) {
        const ret=super.once(event,func);
        setupEventSubscription(event,getStreamByEventType(event));
        return ret;
    }

    /**
     * @param {String} event The event name to map to an observable stream.
     * @return Observable stream.
     */
    @Private
    getStreamByEventType(event) {
        switch(event) {
            case EVENT.DONE:
                return this.bufferedStream;
            case EVENT.TRAP:
                return this.trap;
            case EVENT.FATAL:
                return this.fatal;
            default:
                return this.read;
        }
    }

    /**
     * @param {String} event The name of the event to setup for emitting.
     * @param {Observable} stream The stream to listen for events.
     * @return {Observable} Stream that will send out a copy of its input as long as there are event callbacks for the event requested.
     */
    @Private
    setupEventSubscription(event,stream) {
        if (this.listeners(event)) return;
        // take from the stream until there are no more event listeners for that event.
        const listenerStream = stream.takeWhile(o=>!this.listeners(event));
        listenerStream.subscribe(e=>{
            this.emit(event,e);
        });
        return listenerStream;
    }

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
