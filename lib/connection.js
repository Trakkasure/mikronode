/* jshint undef: true, unused: true */
/* globals Promise */
var net = require('net');
var tls = require('tls');
var events = require('events');
var crypto = require('crypto');
var util = require('util');
var dbg = require('debug');
var utils = require('./utils');
var Channel = require('./channel');
var Trap = require('./trap');

module.exports = (function() {

	var debugSocket = dbg('mikronode:socket');
	var debugSocketData = dbg('mikronode:socket:data');
	var debugLogin = dbg('mikronode:login');
	var debugSentence = dbg('mikronode:sentence');
	var debugConnection = dbg('mikronode:connection');
	var debugPromise = dbg('mikronode:promise');

	var _ = require('private-parts').createKey();
	var emptyString = String.fromCharCode(0);

	/**
	 * Emitted when a non-recoverable error has occurred on the socket. No further commands
	 * can be processed on any channel.
	 * @event mikronode.Connection#event:error
	 * @property {error} error - The error object
	 * @property {mikronode.Connection} connection - The connection originating the event
	 */
	/**
	 * Emitted when a socket has been idle too long.
	 * @event mikronode.Connection#event:timeout
	 * @property {string} message - 'Socket Timeout'
	 * @property {boolean} socketStillOpen - If true, communications can continue
	 * @property {mikronode.Connection} connection - The connection originating the event
	 */
	/**
	 * Emitted when the connection is closed either by an explicit call to
	 * {@link mikronode.Connection#close} or when the connection is closed automatically
	 * via {@link mikronode.Connection#closeOnDone}
	 * @event mikronode.Connection#event:close
	 * @property {mikronode.Connection} connection - The connection originating the event
	 */
	/**
	 * Emitted when a login has failed. No further commands can be processed on any
	 * channel.
	 * @event mikronode.Connection#event:trap
	 * @property {mikronode.Trap} trap - The trap object
	 */

	/**
	 * <strong>An instance of Connection is fully self-contained. You can have as many open
	 * in parallel in the same node process as your environment can handle.</strong>
	 * <p>
	 * @exports mikronode.Connection
	 * @class
	 * @implements {EventEmitter}
	 * @param {string} host - The host name or ip address
	 * @param {string} user - The user name
	 * @param {string} password - The users password
	 * @param {object} [options]
	 * @param {number} [options.port=8728] - Sets the port if not the standard 8728 (8729
	 *           for TLS).
	 * @param {boolean} [options.closeOnDone=false] - If set, when the last channel closes,
	 *           the connection will automatically close.
	 * @param {number} [options.timeout=0] - Sets the socket inactivity timeout. A timeout
	 *           does not necessarily mean that an error has occurred, especially if you're
	 *           only listening for events.
	 * @param {boolean} [options.closeOnTimeout=false] - If set, when a socket timeout
	 *           happens the connection will automatically close.
	 * @param {(object|boolean)} [options.tls] - Set to true to use TLS for this
	 *           connection. Set to an object to use TLS and pass the object to tls.connect
	 *           as the tls options. If your device uses self-signed certificates, you'll
	 *           either have to set 'rejectUnauthorized : false' or supply the proper CA
	 *           certificate. See the options for
	 *           {@link https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback|tls.connect()}
	 *           for more info.
	 * @fires mikronode.Connection#event:trap
	 * @fires mikronode.Connection#event:error
	 * @throws <strong>WARNING: If you do not listen for 'error' or 'timeout' events and
	 *            one occurrs during the initial connection (host unreachable, connection
	 *            refused, etc.), an "Unhandled 'error' event" exception will be thrown.</strong>
	 * @fires mikronode.Connection#event:timeout
	 * @fires mikronode.Connection#event:close
	 *
	 * @example
	 *
	 * <pre>
	 * var MikroNode = require('mikronode');
	 *
	 * var connection = new MikroNode.Connection('192.168.88.1', 'admin', 'mypassword', {
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
	 *
	 */
	function Connection(host, user, password, options) {
		this.hash = crypto.createHash('md5').update(host + user).digest('hex');
		// If we already have a connection, return the same one.
		options = options || {};
		// if (api._conn[this.hash]) return api._conn[this.hash];

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} host - Hostname or ip address
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'host', host, false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} user - User ID
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'user', user, false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} password - Password
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'password', password, false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} [port=8728] - Port
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'port', options.port || (options.tls ? 8729 : 8728), false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} [timeout=0] - Socket inactivity timeout
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'timeout', options.timeout, false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {(object|boolean)} [tls] - Set to true to use TLS for this connection
		 *         with default options. Set to an object to use TLS and pass the object to
		 *         tls.connect as the tls options. If your device uses self-signed
		 *         certificates, you'll either need to set 'rejectUnauthorized : false' or
		 *         supply the proper CA certificate. See the options for
		 *         {@link https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback|tls.connect()}
		 *         for more info.
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'tls', options.tls, false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} status - Connection status
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'status', 'New', false, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {object} channels - Active channels keyed by channel id
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'channels', {}, false, _, true);

		/**
		 * @public
		 * @instance
		 * @member {boolean} [closeOnDone=false] - If set, when the last channel closes, the
		 *         connection will automatically close.
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'closeOnDone', !!options.closeOnDone, true, _);

		/**
		 * @public
		 * @instance
		 * @readonly
		 * @member {boolean} [options.closeOnTimeout=false] - If set, when a socket timeout
		 *         happens the connection will automatically close.
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'closeOnTimeout', !!options.closeOnTimeout, true, _);

		/* The following properties are all private */
		_(this).connected = false;
		_(this).connecting = false;
		_(this).socket = null; // socket connection
		_(this).line = ''; // current line. When the line is built, the sentence event is called.
		_(this).buffer = []; // buffer holding incoming stream from socket
		_(this).packet = []; // current packet
		_(this).currentChannelId = -1;
		_(this).currentReply = '';
		_(this).currentProgress = '';
		_(this).traps = {}; // we encountered a trap.
		_(this).error = {}; // Buffer errors
		_(this).datalen = 0; // Used to look-ahead to see if more data is available
		_(this).connectionCallback = null;

	}
	util.inherits(Connection, events.EventEmitter);

	Connection.prototype.getTraps = function() {
		return _(this).traps;
	};

	/**
	 * Parse !re return records into an array of objects
	 * @function
	 * @static
	 * @param {string[]} data - The data[] returned from Channel.on('done')
	 * @returns {object[]}
	 */
	Connection.parseItems = function parseItems(data) {
		var db = [];
		var idx = 0;
		var record = {};
		// util.puts('parseItems: '+JSON.stringify(data));
		data.forEach(function(data) {
			while (data.length) {
				var l = data.shift().split(/=/);
				if (l[0] === '!re') {
					if (db.length) {
						record = {};
					}
					db.push(record);
					idx++;
					continue;
				}
				l.shift(); // remove empty first element
				record[l.shift()] = l.join('='); // next element is key. All the
				// rest is value.
			}
			if (data.length === 1 && (data[0] !== record)) {
				db.push(record);
			}
		});
		return db;
	};

	/**
	 * Triggered by the 'sentence' event
	 * @private
	 * @param {string} data - Sentence
	 * @param {boolean} more - There's data left to read
	 * @this mikronode.Connection
	 */
	Connection.prototype.sentence = function sentence(data, more) {
		debugSentence('Sentence2:(' + more + ') data: ' + data);

		if (_(this).currentReply === '!fatal') { // our last message was a fatal error.
			_(this).packet.push(data);
			this.emit('fatal', _(this).packet, this);
			if (!_(this).closing) {
				this.close();
			}
			return;

		} else if (data === '!fatal') {
			_(this).currentReply = data;

		} else if (data === '!re') {
			_(this).currentReply = data;
			_(this).currentProgress = '';
			_(this).buffer[_(this).buffer.length] = data;

		} else if (data.match(/\.tag/)) {
			var tagChannelId = data.substring(5);
			_(this).currentChannelId = tagChannelId;

			if ((((_(this).currentProgress === '!done' && (_(this).currentReply === '!re'))) || !more)) {
				debugSentence('Sentence2: Done channel %s  Trapped? %o', tagChannelId, !!_(this).traps[tagChannelId]);
				_(this).packet = _(this).buffer; // backup up the packet
				_(this).buffer = [];
				if (_(this).channels[tagChannelId]) {
					_(this).channels[tagChannelId]._done(_(this).packet, _(this).traps[tagChannelId]);
					_(this).currentChannelId = -1;
				}
			} else if (_(this).currentProgress === '!trap') {
				if (_(this).traps[tagChannelId]) {
					debugSentence('Sentence2: caught second trap');
					_(this).traps[tagChannelId].addTrapError();
				}
				debugSentence('Sentence2: caught a trap for channel %s ', tagChannelId);
				var trap = new Trap();
				trap.channelId = tagChannelId;
				trap.channel = _(this).channels[tagChannelId];
				_(this).traps[tagChannelId] = trap;

			} else if (_(this).currentReply === '!re') {
				_(this).currentChannelId = tagChannelId;
			}

		} else if (data === '!done') {
			debugSentence('Sentence2: Done Signal.');
			_(this).currentProgress = data;
			if (!more) {
				_(this).packet = _(this).buffer;
				_(this).buffer = [];
				debugSentence('Sentence2: No more data in packet. Done.');
				if (Object.keys(_(this).traps).length > 0) {
					this.emit('trap', _(this).traps, this);
					_(this).trap = false;
				} else {
					this.emit('done', _(this).packet);
				}
			}

		} else if (/=ret=/.test(data)) {
			debugSentence('Sentence2: Single return: ' + data);
			_(this).buffer.push('!re');
			_(this).buffer.push(data);
			_(this).packet = _(this).buffer;
			_(this).buffer = [];
			if (!more) {
				if (_(this).channels[_(this).currentChannelId]) {
					_(this).channels[_(this).currentChannelId]
							._done(_(this).packet, _(this).traps[_(this).currentChannelId]);
					_(this).currentChannelId = -1;
				}
			}

		} else if (data === '!trap') {
			_(this).currentProgress = data;
			_(this).buffer[_(this).buffer.length] = data;

		} else {
			if (_(this).currentProgress === '!trap') {
				var m = data.match(/^=(category|message)=(.+)/);
				if (m) {
					var ct = _(this).traps[_(this).currentChannelId];
					ct.errors[ct.errors.length - 1][m[1]] = m[2];
				}
			}
			debugSentence('Sentence2: adding data: ' + data);
			_(this).buffer[_(this).buffer.length] = data;
			if (!more && _(this).currentReply === '!re' && (((_(this).currentChannelId >= 0)))) {
				_(this).packet = _(this).buffer;
				_(this).buffer = [];
				_(this).channels[_(this).currentChannelId]._data(_(this).packet);
				_(this).currentChannelId = -1;
			}
		}
	};

	/**
	 * Triggered by a 'data' event on teh socket
	 * @private
	 * @param {string} data - Sentence
	 * @this mikronode.Connection
	 */
	Connection.prototype._read = function _read(data) {
		if (debugSocketData.enabled) {
			utils.hexDump(data, debugSocketData);
		}
		while (data.length) {
			debugSocket('read: data-len:' + data.length);
			if (_(this).len) { // maintain the current data length. What if the data
				// comes in 2 separate packets?
				// I am hopping that the API on the other end doesn't send more than
				// one channel
				// at a time if more than one packet is required.
				// if (this.debug>3) debug('read: data:'+data);
				if (data.length <= _(this).len) {
					_(this).len -= data.length;
					_(this).line += data.toString();
					debugSocketData('read:consume-all: data:' + data);
					if (_(this).len === 0) {
						this.sentence(_(this).line, (data.length !== _(this).len));
						_(this).line = '';
					}
					break;
				} else {
					debugSocketData('read:consume len:(' + _(this).len + ') data: ' + data);
					_(this).line += data.toString('utf8', 0, _(this).len);
					var l = _(this).line;
					_(this).line = '';
					data = data.slice(_(this).len);
					var x = utils.decodeLength(data);
					_(this).len = x[1];
					data = data.slice(x[0]); // get rid of excess buffer
					if (_(this).len === 1 && data[0] === "\x00") {
						_(this).len = 0;
						data = data.slice(1); // get rid of excess buffer
					}
					this.sentence(l, data.length);
				}
			} else {
				var y = utils.decodeLength(data);
				_(this).len = y[1];
				data = data.slice(y[0]);
				if (_(this).len === 1 && data[0] === "\x00") {
					_(this).len = 0;
					data = data.slice(1); // get rid of excess buffer
				}
			}
		}
	};

	/**
	 * Send data
	 * @private
	 * @param {string} data - Sentence
	 * @this mikronode.Connection
	 */
	Connection.prototype._write = function write(data) {
		var _this = this;
		if (!_(this).connected && !_(this).connecting) {
			debugSocket('write: not connected ');
			return;
		}
		if (typeof (data) === 'string') {
			data = [ data ];
		} else if (!Array.isArray(data)) {
			return;
		}
		data.forEach(function(i) {
			debugSocket('write: sending ' + i);
			_(_this).socket.write(utils.encodeString(i));
		});
		_(this).socket.write(emptyString);
	};

	/**
	 * Called when the connection is established and authenticated
	 * @callback mikronode.Connection.connectCallback
	 * @param {mikronode.Connection}
	 */

	/**
	 * Opens the socket and performs authentication
	 * @param {mikronode.Connection.connectCallback} callback - Called when authentication
	 *           succeeds and the connection is ready for channel activity
	 * @returns {mikronode.Connection}
	 * @fires mikronode.Connection#event:trap
	 * @fires mikronode.Connection#event:error
	 * @throws <strong>WARNING: If you do not listen for 'error' or 'timeout' events and an
	 *            error occurrs during the initial connection (host unreachable, connection
	 *            refused, etc.), an "Unhandled 'error' event" exception will be thrown.</strong>
	 * @fires mikronode.Connection#event:timeout
	 * @fires mikronode.Connection#event:close
	 */
	Connection.prototype.connect = function connect(callBack) {
		if (_(this).connected) {
			return;
		}

		var _this = this;
		_(this).connectionCallback = callBack;
		_(this).status = "Connecting";

		var tempSocket = new net.Socket({
			type : 'tcp4'
		});

		if (_(this).tls) {
			var tlsopts = ((typeof _(this).tls === 'boolean') ? {} : _(this).tls);
			_(this).socket = new tls.TLSSocket(tempSocket, tlsopts);
		} else {
			_(this).socket = tempSocket;
		}

		debugSocket('Created%s socket to %s:%d', _(this).tls ? ' TLS' : '', _(this).host, _(this).port);

		_(this).connecting = true;

		_(this).socket.on('data', function(a) {
			_this._read(a);
		});

		_(this).socket.on('error', function(a) {
			debugSocket('Connection error: ' + a);
			_(_this).socket.destroy();
			_(_this).connected = false;
			_this.emit('error', a, _this);
			_this.emit('close', _this);
			_this.removeAllListeners();
		});

		/**
		 * timeout is triggered if the socket goes inactive for a set period of time. This
		 * may be normal if we're listening for events that may not occur often.
		 */
		if (_(this).timeout) {
			debugConnection('Setting timeout to %d seconds', _(this).timeout);
			/**
			 * Calling setTimeout with a callback is safer than socket.on('timeout') for TLS
			 * sockets
			 */
			_(this).socket.setTimeout(_(this).timeout * 1000, function() {
				debugSocket('Timeout');
				if (_(_this).closeOnTimeout) {
					_this.emit('timeout', 'Socket Timeout', false, _this);
					_(_this).socket.destroy();
					_(_this).connected = false;
					_this.emit('close', _this);
					_this.removeAllListeners();
				} else {
					_this.emit('timeout', 'Socket Timeout', true, _this);
				}
			});
		}
		_(this).socket.setKeepAlive(true);

		/**
		 * Setup is done. Call connect on the NON TLS socket to start the login state
		 * machine. _this.loginStateMachine() can't be passed directly to connect as the
		 * callback because it's 'this' will be the socket instead of our connection.
		 */
		tempSocket.connect(_(this).port, _(this).host, function lsm() {
			_this.loginStateMachine();
		});

		return this;
	};

	Connection.prototype.loginStateMachine = function loginStateMachine() {
		/**
		 * We save the value of closeOnDone as set by the caller, force it to false, then
		 * restore it after successful login. Otherwise, if set set to true, when the login
		 * channel closes, the connection would also be closed and be of no further use.
		 */
		var tempcOD = _(this).closeOnDone;
		_(this).closeOnDone = false;

		var lc = this.openChannel('login');
		/**
		 * lc.closeOnDone has to be false because we're expecting multiple done events.
		 */
		lc.closeOnDone = false;

		_(this).status = 'Sending Login';
		debugLogin(_(this).status);
		lc.write('/login');
		_(this).status = 'Waiting for challenge';
		debugLogin(_(this).status);

		var _this = this;
		lc.on('trap', function loginTrap(data) {
			/** @this is now mikronode.Channel */

			_(_this).status = 'Received Trap';
			debugLogin('%s %o', _(_this).status, data);
			_this.emit('trap', data);
			this.close(true);
			_(_this).closeOnDone = true;
		});

		lc.on('done', function loginDone(data) {
			/** @this is now mikronode.Channel */

			var parsed = Connection.parseItems(data);

			switch (_(_this).status) {

			case 'Waiting for challenge':
				_(_this).status = 'Received challenge';
				debugLogin('%s %o', _(_this).status, parsed);

				var challenge = '';
				var a = parsed[0].ret.split('');
				while (a.length) {
					challenge += String.fromCharCode(parseInt("0x" + a.shift() + a.shift()));
				}

				if (challenge.length !== 16) {
					this.emit('trap', 'Bad challenge: %o Challenge length: %d', data, challenge.length);
					return;
				}

				_(_this).status = 'Sending Credentials';
				debugLogin('%s %s', _(_this).status, _(_this).user);
				this.write('/login', {
					"=name" : _(_this).user,
					"=response" : "00"
							+ crypto.createHash('md5').update(emptyString + _(_this).password + challenge).digest("hex")
				});
				_(_this).status = 'Waiting for Response';
				debugLogin(_(_this).status);
				return;

			case 'Waiting for Response':
				_(_this).status = 'Received Response';
				debugLogin('%s %o', _(_this).status, parsed);
				this.close(true);
				_(_this).status = 'Connected';
				debugLogin(_(_this).status);
				_(_this).connected = true;

				if (_(_this).connectionCallback) {
					_(_this).connectionCallback(_this);
					_(_this).connectionCallback = null;
				}

				_(_this).closeOnDone = tempcOD;
			}
		});
	};

	/**
	 * Opens a new Channel
	 * @public
	 * @param {string} [id=next available] - Automatically assigned ids are numbers but you
	 *           can specify any string.
	 * @returns {mikronode.Channel}
	 */
	Connection.prototype.openChannel = function openChannel(id) {
		var _this = this;
		if (!id) {
			id = Object.keys(_(this).channels).length + 1;
			while (_(this).channels[id]) {
				id++;
			}
		} else if (_(this).channels[id]) {
			throw ('Channel already exists for ID ' + id);
		}
		debugConnection('Opening channel: ' + id);
		_(this).channels[id] = new Channel(id, this);
		_(this).channels[id].addListener('close', function(channel) {
			_this.closeChannel(channel.id);
		});
		return _(this).channels[id];
	};

	/**
	 * Returns the channel specified by id.
	 * @public
	 * @param {number} id - The id of the channel desired
	 * @returns {mikronode.Channel}
	 */
	Connection.prototype.getChannel = function getChannel(id) {
		if (!id && id !== 0) {
			throw ('Missing channel ID parameter' + id);
		}
		if (!_(this).channels[id]) {
			throw ('Channel does not exist for ID ' + id);
		}
		debugConnection('Getting channel: ' + id);
		return _(this).channels[id];
	};

	/**
	 * Closes the channel specified by id.
	 * @public
	 * @param {number} id - The id of the channel to close
	 */
	Connection.prototype.closeChannel = function closeChannel(id) {
		if (!id) {
			throw ("Missing ID for stream channel to close.");
		}
		if (!_(this).channels[id]) {
			throw ('Channel does not exist for ID ' + id);
		}
		// Make sure that the channel closes itself... so that remaining
		// commands will execute.
		if (!_(this).channels[id].closed) {
			return _(this).channels[id].close();
		}
		delete _(this).channels[id];
		var channelsLeft = Object.keys(_(this).channels).length;
		debugConnection('Closing channel: %s  Channels left: %d', id, channelsLeft);
		if (channelsLeft === 0 && ((_(this).closing || _(this).closeOnDone))) {
			debugConnection('Last channel closed');
			this.close();
		}
	};

	Connection.prototype.close = function close(force) {
		var _this = this;
		if (!_(this).connected) {
			debugConnection('Connection already disconnected: ' + _(this).host);
			_(this).socket.destroy();
			_(this).connected = false;
			this.removeAllListeners();
			this.emit('close', this);
			this.removeAllListeners();
			return;
		}
		if (!force && ((Object.keys(_(this).channels).length > 0))) {
			_(this).closing = true;
			debugConnection('deferring closing connection');
			return;
		}
		debugConnection('Connection disconnecting: ' + _(this).host);
		this.removeAllListeners('done');
		this.removeAllListeners('error');
		this.removeAllListeners('timeout');

		if (force) {
			Object.keys(_(this).channels).forEach(function(e) {
				_(_this).channel[e].close(true);
			});
		}
		this.once('fatal', function() { // quit command ends with a fatal.
			debugConnection('Connection disconnected: ' + _(this).host);
			_(_this).socket.destroy();
			_(_this).connected = false;
			_this.removeAllListeners();
			_this.emit('close', _this);
		});
		_(this).closing = false;
		// delete api._conn[_(this).hash];
		this._write([ '/quit' ]);
		_(this).closing = true;
	};

	Connection.prototype.finalize = function finalize() {
		_(this).close(true);
	};

	/**
	 * Returns a Promise for an open connection.
	 * <p>
	 * The promise will resolve when the connection is ready for use or reject if there's
	 * an error or trap. If resolved, the result object will be the
	 * {@link mikronode.Connection} with authentication completed and ready for channels.
	 * If rejected, the result object will be an Error if there was a socket error or
	 * timeout during connection or login or a {@link mikronode.Trap} if there was a
	 * problem with the login credentials.
	 * <p>
	 * @returns {Promise}
	 *
	 * @example
	 *
	 * <pre>
	 * var MikroNode = require('mikronode');
	 *
	 * var connection = new MikroNode.Connection(process.argv[2], process.argv[3], process.argv[4], {
	 * 	closeOnDone : true
	 * });
	 *
	 * var connPromise = connection.getConnectPromise().then(function resolve(conn) {
	 * // You now have an open, authenticated connection
	 * // To issue some commands see {@link mikronode.Connection#getCommandPromise getCommandPromise}
	 * });
	 * </pre>
	 */
	Connection.prototype.getConnectPromise = function connectPromise() {
		var _this = this;
		return new Promise(function(resolve, reject) {
			try {
				_this.on('error', function(err) {
					debugConnection('Error: %o', err);
					reject(err);
					_this.close();
				});

				_this.on('trap', function(err) {
					debugConnection('Trap: %o', err);
					reject(err);
					_this.close();
				});

				_this.on('timeout', function(err) {
					debugConnection('Timeout: %o', err);
					reject(err);
					_this.close();
				});

				_this.connect(function connect(connection) {
					debugConnection('Resolved');
					resolve(connection);
				});
			} catch (err) {
				reject(err);
			}
		});
	};

	/**
	 * ** Returnes a Promise of a completed command.
	 * <p>
	 * The promise will resolve when the command completes or reject if there's an error or
	 * trap. If resolved, the result will be an array of instances of DestinationClass (or
	 * Object, if no destination class was specified). If rejected, the result will be an
	 * Error if there was a socket error or timeout, or a {@link mikronode.Trap} if the
	 * command failed on the device.
	 *
	 * @param {(string|string[])} data - Can be a single string with the command and
	 *           optional parameters separated by '\n' or an array of strings with the
	 *           command in the first position and the parameters in the rest.
	 * @param {(object|string[])} [parameters] - If the first parameter is a command
	 *           string, this object will be treated as the parameters for the command.
	 *           <p>
	 *           It can be an array or strings...
	 *
	 * <pre>
	 * ['name=value','name=value'...]
	 * </pre>
	 *
	 * or an Object...
	 *
	 * <pre>
	 * {'name': 'value', 'name': 'value'...}
	 * </pre>
	 *
	 * @param {object} [options] - A set of options that determine what to do with the
	 *           return data (if any). If neither dataClass nor itemClass are provided, the
	 *           default behavior will be as though itemClass were set to Object. This will
	 *           result in Promise.resolve() being called with an array of plain Objects,
	 *           one for each parsed item.
	 * @param {boolean} [options.closeOnDone=true] - If true, the channel will
	 *           automatically close when the command completes.
	 * @param {boolean} [options.dontParse=false] - If true, Promise.resolve() will be
	 *           called with the unaltered data array provided by the channel's 'done'
	 *           event. with the unaltered data array provided by the channel's 'done'
	 *           event.
	 * @param {class} [options.dataClass] - If provided, this class will be instantiated
	 *           with the data array provided by the channel's 'done' event as the
	 *           constructor's sole argument. Promise.resolve() will then be called with
	 *           this object.
	 * @param {class} [options.itemClass] - If provided, {mikronode.parseItems} will be
	 *           called on the returned data and this class will be instantiated once for
	 *           each resulting item. The item object will be passed as the sole argument
	 *           to the constructor. An array of itemClass objects will be passed to
	 *           Promise.resolve().
	 * @param {string} [options.itemKey] - If provided, instead of an array of parsed
	 *           objects being passed to Promise.resolve(), the parsed objects will be
	 *           added to a wrapper object using the value of itemKey as the property name.
	 *
	 * @return {Promise} The promise will have a channel property added which will be set
	 *         to the channel used to fulfill the promise.
	 *
	 * @example
	 *
	 * <pre>
	 *
	 * function Interface(intf) {
	 * 	var _this = this;
	 * 	Object.keys(intf).forEach(function(key) {
	 * 		_this[key] = intf[key];
	 * 	});
	 * }
	 *
	 * var chan1Promise = conn.getCommandPromise('/interface/print', {
	 * 	itemClass : Interface,
	 * 	itemKey : 'name'
	 * });
	 *
	 * chan1Promise.then(function(values){
	 * // It succeeded. You'll have a hash of Interfaces keyed by interface name.
	 * });
	 *
	 * chan1Promise.catch(function(result){
	 * // It failed. result will tell you why.
	 * });
	 * </pre>
	 */
	Connection.prototype.getCommandPromise = function commandPromise(data, parameters, options) {
		var _this = this;
		debugConnection('getCommandPromise');
		if (parameters
				&& !Array.isArray(parameters)
				&& (parameters.hasOwnProperty('closeOnDone') || parameters.hasOwnProperty('dontParse')
						|| parameters.dataClass || parameters.itemClass || parameters.itemKey)) {
			options = parameters;
			parameters = null;
		}
		options = options || {};
		var chan = _this.openChannel();

		chan.closeOnDone = options.hasOwnProperty('closeOnDone') ? options.closeOnDone : true;

		var p1 = new Promise(function(resolve, reject) {
			try {
				chan.write(data, parameters, function() {
					chan.on('error', function(err) {
						debugPromise('Channel %d error: %o', chan.id, err);
						chan.close();
						reject(err);
					});
					chan.on('trap', function(err) {
						debugPromise('Channel %d trap: %o', chan.id, err);
						chan.close();
						reject(err);
					});
					chan.on('timeout', function(err) {
						debugPromise('Channel %d timeout', chan.id);
						chan.close();
						reject(err);
					});
					chan.on('done', function chanDone(data) {
						debugPromise('Channel %d done: %o', chan.id, data);
						if (options.dontParse) {
							resolve(data);
							return;
						}
						if (typeof options.dataClass === 'function') {
							resolve(new options.dataClass(data));
							return;
						}
						var items;
						if (options.itemKey) {
							items = {};
						} else {
							items = [];
						}
						var parsed = Connection.parseItems(data);
						parsed.forEach(function(item) {
							var o;
							if (typeof options.itemClass === 'function') {
								o = new options.itemClass(item);
							} else {
								o = {};
								Object.keys(item).forEach(function(k) {
									o[k] = item[k];
								});
							}
							if (options.itemKey) {
								items[item[options.itemKey]] = o;
							} else {
								items.push(o);
							}
						});
						resolve(items);
					});
				});
			} catch (err) {
				reject(err);
			}
		});
		p1.channel = chan;
		return p1;
	};

	return Connection;
})();
