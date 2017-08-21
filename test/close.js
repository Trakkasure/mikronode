// this tests that the connection is properly closed.
// This only verifies that all channels have been eliminated.
// A more full-featured test is in the works. 

var api=require('../dist/mikronode.js')

var device=new api('10.10.10.10');
// device.setDebug(api.DEBUG);

device.connect(
    function(err,login) {
        login('admin','password',runProgram);
    }
);

function runProgram(err,c) {

    console.log('Connection established');

    const channel1 = c.openChannel(1);
    const channel2 = c.openChannel(2);
    const channel3 = c.openChannel(3);

    c.on('close',function(c2) {
        var id=channel1.getId();
        console.log("Channel closing...")
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
        id=channel2.getId();
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
        id=channel3.getId();
        try {
            c2.getChannel(id);
            console.log('Channel %s is still available. Error.',id);
        } catch (e) {
            console.log('Channel %s is gone!',id);
        }
    });
    channel1.write('/quit').catch(e=>{console.log("Error writing quit",e)})
}
        
