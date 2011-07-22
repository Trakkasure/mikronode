// this tests that the connection is properly closed.
// This only verifies that all channels have been eliminated.
// A more full-featured test is in the works. 

api=require('../lib/index.js')

config=require('./config.js');
config.push({debug:2}); // Add debug options to see what's happening.
connection=api.prototype.constructor.apply(api,config)

connection.connect(function(c) {
    console.log('Connection established');

    channel1 = c.openChannel();
    channel2 = c.openChannel();
    channel3 = c.openChannel();
    

    c.on('close',function(c2) {
        id=channel1.getId();
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
    channel1.write('/quit')
});
        
