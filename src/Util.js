function encodeString(s,d) {
    var data = null;
    var len = Buffer.byteLength(s);
    var offset=0;

    if (len < 0x80) {
            data=new Buffer(len+1);
            data[offset++]=len;
    } else 
    if (len < 0x4000) {
            data=new Buffer(len+2);
            len |= 0x8000;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else
    if (len < 0x200000) {
            data=new Buffer(len+3);
            len |= 0xC00000;
            data[offset++]=(len >> 16) & 0xff;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else
    if (len < 0x10000000) {
            data=new Buffer(len+4);
            len |= 0xE0000000;
            data[offset++]=(len >> 24) & 0xff;
            data[offset++]=(len >> 16) & 0xff;
            data[offset++]=(len >> 8) & 0xff;
            data[offset++]=len & 0xff;
    } else {
        data=new Buffer(len+5);
        data[offset++]=0xF0;
        data[offset++]=(len >> 24) & 0xff;
        data[offset++]=(len >> 16) & 0xff;
        data[offset++]=(len >> 8) & 0xff;
        data[offset++]=len & 0xff;
    }
    data.utf8Write(s,offset);
    d&&console.log("Writing ",data);
    return data;
}

function decodePacket(data){
    if (!data.length) return [];
    const buf=[];
    let idx=0;
    while (idx<data.length) {
        let len;
        let b=data[idx++];
        if (b&128) { // Ported from the PHP API on the Wiki. Thanks
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
        // console.log("Pushing ",idx,len,data.slice(idx,idx+len));
        buf.push(data.slice(idx,idx+len).toString('utf8'));
        idx+=len;
    }
    return buf;
}
//hexDump=require('./hexdump');
function hexDump(data) {
    var hex=[]
    var cref=[];
    var i=0,j=0;
    for (j=0;j<data.length;j++) {
        i=j%8;
        //m=ctrl.indexOf(data[j]);
        if (data[j]<20||data[j]>126) cref[i]='.';
        else cref[i]=String.fromCharCode(data[j])
        hex[i]=Number(data[j]).toString(16);
        while (hex[i].length < 2) hex[i] = "0" + hex[i];
        if (hex.length==8) {
            console.log("%d: %s    %s",j-7,hex.join(' '),cref.join('') );
            hex=[];
            cref=[];
        }
    }
    if (i!=8) {
        console.log(hex.join(' ')+'    '+ cref.join('') )
        hex=[];
        cref=[];
    }
}

// This is probably over done...
// Uncomment if you want to detail trace your promises.
function nullfunc(){}
const rejectionWatcher=new WeakMap();

// function clearRejectionTrack(catcher,reason) {
//     const x=rejectionWatcher.get(this);
//     x.splice(x.findIndex(catcher),1);
//     return catcher.call(this,reason);
// }

// function proxyThenCatch(promise) {
//     const catchEx = promise.catch;
//     const thenEx = promise.then;
    
//     console.log("Adding promise to watcher map");
//     // rejectionWatcher.set(promise,[]);

//     promise.then=function(handler,catcher) {
//         if (catcher) {
//             // rejectionWatcher.get(promise).push(catcher);
//             console.log("tracking catcher");
//         }
//         return proxyThenCatch(thenEx.call(promise,handler,clearRejectionTrack.bind(promise,catcher)));
//     }.bind(promise);

//     promise.catch=function(catcher) {
//         if (!catcher) return;
//         // rejectionWatcher.get(promise).push(catcher);
//         return proxyThenCatch(catchEx.call(promise,catcher));
//     }.bind(promise);
//     return promise;
// }

process.on('unhandledRejection',function(event,promise){
    if (event.cmd) return;
    //     console.log("caught unhandled rejection. Command still running...");
    //     rejectionWatcher.set(promise,event);
    // } else
        console.error("Unhandled rejection: ",JSON.stringify(event,true,4),'\n',promise);
});

// process.on('rejectionHandled',function(p){
//     console.log('Rejection handled.');
//     rejectionWatcher.delete(p);
// });

function getUnwrappedPromise() {
    let resolve,reject;
    const e = new Error();
    const promise = new Promise((res,rej)=>{
        resolve=res;
        reject=rej;
    });
    promise.createdAt=e.stack.split('\n').slice(2,3).join('\n');
    return {
        get promise() {
            return promise;
        }
      , resolve:function(...args) {
          if (resolve===nullfunc) return;
        //   const e = new Error();
        //   console.log("Resolving promise",promise);
        //   console.log(e.stack.split('\n').slice(2).join('\n'))
          reject=nullfunc;
          const r=resolve(...args);
          resolve=nullfunc;return r;
        }
      , reject:function(...args) {
          if (reject===nullfunc) return;
        //   const e = new Error();
        //   console.log("Rejecting promise",promise);
        //   console.log(e.stack.split('\n').slice(2).join('\n'))
          resolve=nullfunc;
          const r=reject(...args);
          reject=nullfunc;
          return r;
        }
    };
}

function objToAPIParams(obj,type) {
    const prefix=type==='print'?'':'=';
    return Object.keys(obj)
        .map(k=>obj[k]?`${prefix}${k}=${obj[k]}`:`${prefix}${k}`);
}

function resultsToObj(r) {
    if (r.type) {
        if(Array.isArray(r.data)) return resultsToObj(r.data);
        return [];
    }
    if (r.length&&Array.isArray(r[0])) return r.map(resultsToObj);
    if (!Array.isArray(r)) return {};
    return r.reduce((p,f)=>{p[f.field]=f.value;return p},{});
}
export {hexDump, decodePacket, encodeString, objToAPIParams, resultsToObj,getUnwrappedPromise};