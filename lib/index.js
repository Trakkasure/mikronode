/* Polyfill needed for private-parts */
if (!('WeakMap' in global)) {
	global.WeakMap = require('weakmap');
}

/* Polyfill needed for Connection */
if (!('Promise' in global)) {
	global.Promise = require('es6-promise').Promise;
}

/**
 * MikroNode
 * @exports mikronode
 * @namespace
 */

var Connection = require('./connection');
module.exports.Connection = Connection;
var Channel = require('./channel');
module.exports.Channel = Channel;

/**
 * Creates or returns a Connection object.
 * @exports mikronode.getConnection
 * @function
 * @static
 * @param {string} host - The host name or ip address
 * @param {string} user - The user name
 * @param {string} password - The users password
 * @param {object} [options]
 * @param {number} [options.port=8728] - Sets the port if not the standard 8728 (8729 for
 *           TLS).
 * @param {boolean} [options.closeOnDone=false] - If set, when the last channel closes,
 *           the connection will automatically close.
 * @param {number} [options.timeout=0] - Sets the socket inactivity timeout. A timeout
 *           does not necessarily mean that an error has occurred, especially if you're
 *           only listening for events.
 * @param {boolean} [options.closeOnTimeout=false] - If set, when a socket timeout happens
 *           the connection will automatically close.
 * @param {(object|boolean)} [options.tls] - Set to true to use TLS for this connection.
 *           Set to an object to use TLS and pass the object to tls.connect as the tls
 *           options. If your device uses self-signed certificates, you'll either have to
 *           set 'rejectUnauthorized : false' or supply the proper CA certificate. See the
 *           options for
 *           {@link https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback|tls.connect()}
 *           for more info.
 * @fires mikronode.Connection#event:trap
 * @fires mikronode.Connection#event:error
 * @throws <strong>WARNING: If you do not listen for 'error' or 'timeout' events and one
 *            occurrs during the initial connection (host unreachable, connection refused,
 *            etc.), an "Unhandled 'error' event" exception will be thrown.</strong>
 * @fires mikronode.Connection#event:timeout
 * @fires mikronode.Connection#event:close
 * 
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
 * 
 * connection.on('error', function(err) {
 * 	console.error('Error: ', err);
 * });
 * 
 * </pre>
 */
module.exports.getConnection = function getConnection(host, user, password, options) {
	return new Connection(host, user, password, options);
};

/**
 * Parse !re return records into an array of objects
 * @exports mikronode.parseItems
 * @function
 * @static
 * @param {string[]} data - The data[] returned from Channel.on('done')
 * @returns {object[]} - An Array of objects
 */
module.exports.parseItems = Connection.parseItems;
