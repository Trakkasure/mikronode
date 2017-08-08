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

function decodeLength(data){ // Ported from the PHP API on the Wiki. Thanks
    if (!data.length) return [[],0];
    var idx=0;
    var len=data.length;
    var b=data[idx++];
    if (b&128) {
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
    return [data.slice(idx),len];
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

function objToAPIParams(obj,type) {
    const prefix=type==='print'?'?':'=';
    return Object.keys(obj).map(k=>obj[k]?`${prefix}${k}=${obj[k]}`:`${prefix}${k}`);
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
export {hexDump, decodeLength, encodeString, objToAPIParams, resultsToObj};