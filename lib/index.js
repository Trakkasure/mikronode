var Connection = require('./connection');
var Channel = require('./channel');

/**
 * MikroNode
 * @module mikronode
 * @requires net
 * @requires events
 * @requires crypto
 * @requires util
 * @requires debug
 */
module.exports = (function() {

	/**
	 * @exports mikronode.MikroNode
	 * @class
	 */
	function MikroNode() {
		throw new Error('Not a constructor');
	}

	/**
	 * Creates or returns a Connection object.
	 * @function
	 * @param {string} host - The host name or ip address
	 * @param {string} user - The user name
	 * @param {string} password - The users password
	 * @param {object} [options]
	 * @param {number} [options.port=8728] - Sets the port if not the standard 8728.
	 * @param {boolean} [options.closeOnDone=false] - If set, when the last channel closes,
	 *           the connection will automatically close.
	 * @param {number} [options.timeout=0] - Sets the socket inactivity timeout. A timeout
	 *           does not necessarily mean that an error has occurred, especially if you're
	 *           only listening for events.
	 * @param {boolean} [options.closeOnTimeout=false] - If set, when a socket timeout
	 *           happens the connection will automatically close.
	 * @returns {mikronode.Connection}
	 * @example
	 * 
	 * <pre>
	 * var MikroNode = require('mikronode');
	 * 
	 * var connection = MikroNode.getConnection('192.168.88.1', 'admin', 'mypassword', {
	 * 	timeout : 4,
	 * 	closeOnDone : true,
	 * 	closeOnTimeout : true,
	 * });
	 * </pre>
	 */
	MikroNode.getConnection = function getConnection(host, user, password, options) {
		return new Connection(host, user, password, options);
	};

	MikroNode.parseItems = Connection.parseItems;

	MikroNode.Connection = Connection;
	MikroNode.Channel = Channel;

	Object.seal(MikroNode);

	return MikroNode;
})();
