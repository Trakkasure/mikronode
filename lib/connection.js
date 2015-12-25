/**
 * http://usejsdoc.org/
 */
/* jshint undef: true, unused: true */
/* globals Promise */
var net = require('net');
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
	 * Connection
	 * <p>
	 * This class shouldn't be instantiated directly.
	 * @exports mikronode.Connection
	 * @class
	 * @implements {EventEmitter}
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
	 * @fires mikronode.Connection#event:trap
	 * @fires mikronode.Connection#event:error
	 * @fires mikronode.Connection#event:timeout
	 * @fires mikronode.Connection#event:close
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
		utils.createProperty(this, 'host', host);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} user - User ID
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'user', user);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string} password - Password
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'password', password);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} [port=8728] - Port
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'port', options.port || 8728);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} [timeout=0] - Socket inactivity timeout
		 * @memberof mikronode.Connection
		 */
		utils.createProperty(this, 'timeout', options.timeout);

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
		 * @instance
		 * @member {boolean} [closeOnDone=false] - If set, when the last channel closes, the
		 *         connection will automatically close.
		 * @memberof mikronode.Connection
		 */
		this.closeOnDone = options.closeOnDone;

		/**
		 * @public
		 * @instance
		 * @readonly
		 * @member {boolean} [options.closeOnTimeout=false] - If set, when a socket timeout
		 *         happens the connection will automatically close.
		 * @memberof mikronode.Connection
		 */
		this.closeOnTimeout = options.closeOnTimeout;

		/* The following properties are all private */
		_(this).connected = false;
		_(this).connecting = false;
		_(this).socket = null; // socket connection
		_(this).line = ''; // current line. When the line is built, the sentence event is called.
		_(this).buffer = []; // buffer holding incoming stream from socket
		_(this).packet = []; // current packet
		_(this).channel = {}; // all channels in use
		_(this).currentChannelId = -1;
		_(this).currentReply = '';
		_(this).traps = {}; // we encountered a trap.
		_(this).error = {}; // Buffer errors
		_(this).datalen = 0; // Used to look-ahead to see if more data is available
		_(this).loginHandler = null;

	}
	util.inherits(Connection, events.EventEmitter);

	/**
	 * Parse !re return records into an array of objects
	 * @function
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
		} else if (data === '!done') {
			debugSentence('Sentence2: Done Signal.');
			_(this).currentReply = data;
			if (!more) {
				_(this).packet = _(this).buffer;
				_(this).buffer = [];
				debugSentence('Sentence2: No more data in packet. Done.');
				if (_(this).trap) {
					this.emit('trap', _(this).trap, this);
					_(this).trap = false;
				} else {
					this.emit('done', _(this).packet);
				}
			}
		} else if (data.match(/\.tag/)) {
			var tagChannelId = data.substring(5);
			_(this).currentChannelId = tagChannelId;

			if (_(this).currentReply === '!done') {
				debugSentence('Sentence2: Done channel ' + tagChannelId + '.');
				_(this).packet = _(this).buffer; // backup up the packet
				_(this).buffer = [];
				if (_(this).channel[tagChannelId]) {
					_(this).channel[tagChannelId]._done(_(this).packet, _(this).traps[tagChannelId]);
					_(this).currentChannelId = -1;
				}
			} else if (_(this).currentReply === '!trap') {
				if (_(this).traps[tagChannelId]) {
					debugSentence('Sentence2: caught second trap');
					_(this).traps[tagChannelId].addTrapError();
				}
				debugSentence('Sentence2: caught a trap');
				var trap = new Trap();
				trap.channelId = tagChannelId;
				trap.channel = _(this).channel[tagChannelId];
				_(this).traps[tagChannelId] = trap;

			} else if (_(this).currentReply === '!re') {
				_(this).currentChannelId = tagChannelId;
			}
		} else if (/=ret=/.test(data)) {
			debugSentence('Sentence2: Single return: ' + data);
			_(this).buffer.push('!re');
			_(this).buffer.push(data);
			_(this).packet = _(this).buffer;
			_(this).buffer = [];
			if (!more) {
				this.emit('done', _(this).packet);
			}
		} else if (data === '!trap') {
			_(this).currentReply = data;
			_(this).buffer[_(this).buffer.length] = data;
		} else if (data === '!re') {
			_(this).currentReply = data;
			_(this).buffer[_(this).buffer.length] = data;
		} else {
			if (_(this).currentReply === '!trap') {
				var m = data.match(/^=(category|message)=(.+)/);
				if (m) {
					var ct = _(this).traps[_(this).currentChannelId];
					ct.errors[ct.errors.length - 1][m[1]] = m[2];
				}
			}
			debugSentence('Sentence2: adding data: ' + data);
			_(this).buffer[_(this).buffer.length] = data;
			if (!more && _(this).currentReply === '!re' && _(this).currentChannelId >= 0) {
				_(this).packet = _(this).buffer;
				_(this).buffer = [];
				_(this).channel[_(this).currentChannelId]._data(_(this).packet);
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
	Connection.prototype.read = function read(data) {
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
						this.emit('sentence', _(this).line, (data.length !== _(this).len));
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
					this.emit('sentence', l, data.length);
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
	 * connectCallback
	 * @callback mikronode.Connection.connectCallback
	 * @param {mikronode.Connection}
	 */

	/**
	 * Opens the socket and performs authentication
	 * @param {mikronode.Connection.connectCallback} callback - Called when authentication
	 *           succeeds and the connection is ready for channel activity
	 * @this mikronode.Connection
	 */
	Connection.prototype.connect = function connect(callBack) {
		if (_(this).connected) {
			return;
		}
		var _this = this;
		_(this).connectionCallback = callBack;
		_(this).status = "Connecting";
		this.addListener('fatal', function(conn) {
			conn.close();
		});
		_(this).socket = new net.Socket({
			type : 'tcp4'
		});
		debugSocket('Created socket to %s:%d', this.host, this.port);
		_(this).connecting = true;
		_(this).socket.on('data', function(a) {
			_this.read(a);
		});
		_(this).socket.on('error', function(a) {
			debugSocket('Connection error: ' + a);
			_(_this).socket.destroy();
			_(_this).connected = false;
			_this.emit('error', a, _this);
			_this.emit('close', _this);
			_this.removeAllListeners();
		});
		_(this).socket.on('timeout', function(a) {
			debugSocket('Timeout: ' + a);
			if (_this.closeOnTimeout) {
				_this.emit('timeout', 'Socket Timeout', false, _this);
				_(_this).socket.destroy();
				_(_this).connected = false;
				_this.emit('close', _this);
				_this.removeAllListeners();
			} else {
				_this.emit('timeout', 'Socket Timeout', true, _this);
			}
		});

		// This will be called if there is no activity to the server.
		// If this occurs before the login is successful, it could be
		// that it is a connection timeout.
		if (this.timeout) {
			_(this).socket.setTimeout(this.timeout * 1000);
		}
		_(this).socket.setKeepAlive(true);
		this._connector();
		// While logging in, if an error occurs, we should kill the socket.
		// This will keep node from not terminating due to lingering
		// sockets.
		return this;
	};

	/**
	 * Created the loginHandler
	 * @private
	 * @this mikronode.Connection
	 */
	Connection.prototype._connector = function _connector() {
		var _this = this;
		/**
		 * The loginHandler runs as an event callback from Socket so it's 'this' is Socket
		 * @private
		 * @this net.Socket
		 */
		_(this).loginHandler = function loginHandler(d) {
			debugSocket('loginHandler read from %s: %s', _this.host, d);
			switch (_this.status) {
			case 'Connecting':
				_(_this).status = 'Sending Login';
				debugLogin('Connected to %s: %s', _this.host, _this.status);
				_this._write('/login');
				break;
			case 'Sending Login':
				if (d.length < 1) {
					return;
				}
				if (d === '!done') {
					debugLogin('Got !done. Need challenge');
					return; // waiting for challenge
				}
				if (/=ret=/.test(d)) {
					debugLogin('Got challenge');
					_(_this).status = 'Sending Credentials';
					debugLogin(_(_this).status);
					var challenge = '';
					var a = d.split('=')[2].split('');
					while (a.length) {
						challenge += String.fromCharCode(parseInt("0x" + a.shift() + a.shift()));
					}
					if (challenge.length !== 16) {
						_(_this).status = 'Error';
						debugLogin(_(_this).status);
						_(_this).error = 'Bad connection response: ' + d;
						debugLogin('Challenge length:' + challenge.length);
						debugLogin(_(_this).error);
						_this.removeListener('sentence', _this.loginHandler);
						_this.close();
					} else {
						this
								._write([
										"/login",
										"=name=" + _this.user,
										"=response=00"
												+ crypto.createHash('md5').update(emptyString + _this.password + challenge).digest(
														"hex") ]);
					}
				}
				break;
			case 'Sending Credentials':
				if (_(_this).trap) {
					if (d === '!done') {
						_this.emit('trap', _(_this).trap);
						_(_this).trap = false;
						_(_this).status = "Connecting";
						return;
					} else {
						d = d.split(/=/); // Catch multiple trap return keys.
						if (d.length > 2) {
							_(_this).trap[d[1]] = d[2];
						}
					}
				} else if (d === '!done') {
					_(_this).status = 'Connected';
					_this.removeAllListeners('sentence');
					_this.removeAllListeners('fatal');
					_this.removeAllListeners('trap');
					_this.addListener('sentence', function(data, more) {
						_this.sentence(data, more);
					});
					debugLogin(_(_this).status);
					_(_this).connected = true;
					if (_(_this).connectionCallback) {
						_(_this).connectionCallback(this);
						_(_this).connectionCallback = null;
					}
				} else {
					if (d === '!trap') {
						debugLogin('Login Trap ' + d);
						_this.removeAllListeners('sentence');
						_this.addListener('sentence', function(data, more) {
							debugLogin('sentence' + data);
							_this.sentence(data, more);
						});
						_this.sentence(d); // start off trap processing.
					}
					debugLogin(_(_this).status);
				}
				break;
			case 'Connected':
				_this.removeListener('sentence', _this.loginHandler);
			}
		};
		this.addListener('sentence', _(this).loginHandler);
		debugSocket('Connecting to %s:%d', this.host, this.port);
		_(this).socket.connect(this.port, this.host, _(this).loginHandler);
	};

	/**
	 * Opens a new Channel
	 * @public
	 * @param {number} [id=next available]
	 * @returns {mikronode.Channel}
	 */
	Connection.prototype.openChannel = function openChannel(id) {
		var _this = this;
		if (!id) {
			id = Object.keys(_(this).channel).length + 1;
			while (_(this).channel[id]) {
				id++;
			}
		} else if (_(this).channel[id]) {
			throw ('Channel already exists for ID ' + id);
		}
		debugConnection('Opening channel: ' + id);
		_(this).channel[id] = new Channel(id, this);
		_(this).channel[id].addListener('close', function(channel) {
			_this.closeChannel(channel.id);
		});
		return _(this).channel[id];
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
		if (!_(this).channel[id]) {
			throw ('Channel does not exist for ID ' + id);
		}
		debugConnection('Getting channel: ' + id);
		return _(this).channel[id];
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
		if (!_(this).channel[id]) {
			throw ('Channel does not exist for ID ' + id);
		}
		// Make sure that the channel closes itself... so that remaining
		// commands will execute.
		if (!_(this).channel[id].closed) {
			return _(this).channel[id].close();
		}
		debugConnection('Closing ' + this.host + ' channel: ' + id);
		delete _(this).channel[id];
		if (Object.keys(_(this).channel).length === 0 && (_(this).closing || this.closeOnDone)) {
			this.close();
		}
	};

	Connection.prototype.close = function close(force) {
		var _this = this;
		if (!_(this).connected) {
			debugConnection('Connection disconnected: ' + this.host);
			_(this).socket.destroy();
			_(this).connected = false;
			this.removeAllListeners();
			this.emit('close', this);
			this.removeAllListeners();
			return;
		}
		if (!force && (Object.keys(_(this).channel).length > 0)) {
			_(this).closing = true;
			debugConnection('deferring closing connection');
			return;
		}
		debugConnection('Connection disconnecting: ' + this.host);
		this.removeAllListeners('done');
		this.removeAllListeners('error');
		this.removeAllListeners('timeout');

		if (force) {
			Object.keys(_(this).channel).forEach(function(e) {
				_(_this).channel[e].close(true);
			});
		}
		this.once('fatal', function() { // quit command ends with a fatal.
			debugConnection('Connection disconnected: ' + this.host);
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
	 * Returnes a Promise of a completed command.
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
	 * @returns {Promise} ZZ The promise will have a channel property added which will be
	 *          set to the channel used to fulfill the promise.
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
	Object.seal(Connection);

	return Connection;
})();
