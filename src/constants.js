

const STRING_TYPE=typeof "";

const DEBUG = {
    NONE:0
  , ERROR:1
  , WARN:2
  , INFO:4
  , DEBUG:8
  , SILLY:16
};

const connectionLabels = {
    DISCONNECTED:"Disconnected" // Disconnected from device
  , ERROR:"Error" // ERROR defined above means a connect or transport error.
  , CONNECTING:"Connecting"   // Connecting to device
  , CONNECTED:"Connected"    // Connected and idle
  , WAITING:"Waiting"      // Waiting for response(s)
  , CLOSING:"Closing" 
  , CLOSED:"Closed" 
};

const CONNECTION = {
    DISCONNECTED:0
  , CONNECTING:1
  , CONNECTED:2
  , WAITING:4
  , CLOSING:8
  , CLOSED:16
  , ERROR: 32
};

const CHANNEL = {
    NONE:0
  , OPEN : 1
  , CLOSED : 2
  , CLOSING : 4
  , RUNNING : 8
  , DONE:16
};
const EVENT = {
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

export {STRING_TYPE, DEBUG, CONNECTION, CHANNEL, EVENTS, connectionLabels};