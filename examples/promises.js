/* jshint undef: true */
/* globals Promise */

/**
 * Example using Promises and parallel Channels
 */

/** Require the module */
var MikroNode = require('../lib/index.js');

/** Get a Connection Object */
var connection = new MikroNode.Connection(process.argv[2], process.argv[3], process.argv[4], {
	closeOnDone : true
});

/**
 * This class gets instantiated once for each item returned with an object representing
 * the item. You could do different things here based on interface type for instance.
 */
function Interface(intf) {
	var _this = this;
	Object.keys(intf).forEach(function(key) {
		_this[key] = intf[key];
	});
}

/**
 * This class gets instantiated once with the unaltered response. What you do with it is
 * up to you.
 */
function Routes(routeArray) {
	routeArray = MikroNode.parseItems(routeArray);
	this.routes = {};
	for (var i = 0; i < routeArray.length; i++) {
		this.routes[routeArray[i]['.id']] = routeArray[i];
	}
}

/**
 * Start the connection and login sequence. When resolved, you'll have an active,
 * authenticated connection ready for channel work
 */
var connPromise = connection.getConnectPromise().then(function resolve(conn) {

	/**
	 * Get promises for 2 comands in parallel. They'll be sent to the device in the order
	 * you specify BUT which one the device fulfills first is up to it. You should not
	 * depend on the order.
	 */

	/**
	 * For the first command, we're specifying an itemClass and itemKey. The result will be
	 * a generic object wrapper containing Interface objects keyed by the interface name.
	 */
	var chan1Promise = conn.getCommandPromise('/interface/print', {
		itemClass : Interface,
		itemKey : 'name'
	});

	/**
	 * For the second command, we're specifying an dataClass. The result will be a single
	 * Routes object containing whatever you populated in the Routes constructor.
	 */
	var chan2Promise = conn.getCommandPromise('/ip/route/print', {
		dataClass : Routes
	});

	/**
	 * We're now waiting for BOTH commands to resolve or reject.
	 */
	Promise.all([ chan1Promise, chan2Promise ]).then(function resolved(values) {
		/**
		 * Since .all was called with [ chan1Promise, chan2Promise ] values[0] will be the
		 * result from chan1Promise and values[1] will be the result from chan2Promise
		 * regardless of the order you created the promises.
		 */
		console.log('Interfaces via Promise: ', values[0]);
		console.log('Routes via Promise: ', values[1]);
	}, function rejected(reason) {
		/**
		 * This is the rejection from the command promises. You may get Socket errors if the
		 * connection fails, or a Trap if there was a problem with the command.
		 */
		console.log('Oops: ' + reason);
	});

	/**
	 * There are lots of ways to code this besides the above.
	 * 
	 * <pre>
	 * var p = Promise.all([ chan1Promise, chan2Promise ]);
	 * p.then(function(values){
	 *  ...
	 * });
	 * p['catch'](function(result){
	 *  ...
	 * });
	 * </pre>
	 * 
	 * or
	 * 
	 * <pre>
	 * Promise.all([ chan1Promise, chan2Promise ]).then(function resolved(values){
	 *  ...
	 * }).catch(function rejected(result){
	 *  ...
	 * });
	 * </pre>
	 * 
	 * or
	 * 
	 * <pre>
	 * Promise.all([ chan1Promise, chan2Promise ], function resolved(values){
	 *  ...
	 * }, function rejected(result){
	 *  ...
	 * });
	 * </pre>
	 * 
	 */

}, function reject(result) {
	/**
	 * This is the rejection from the connect promise. You may get Socket errors if the
	 * connection failed or a Trap if login failed.
	 */
	console.log(result);
});
