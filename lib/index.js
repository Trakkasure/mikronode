var net = require('net');
var events = require('events');
var crypto = require('crypto');
var util = require('util');
var debug = require('@f5eng/debug')('mikronode');
/* jshint undef: true, unused: true */
/* globals Promise */

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
	var _ = require('private-parts').createKey();
	var emptyString = String.fromCharCode(0);

	/**
	 * Encodes a string
	 * @exports mikronode.encodeString
	 * @function
	 * @param {string} s The string to encode
	 * @returns {Buffer} Encoded string
	 */
	function encodeString(s) {
		var data = null;
		var len = Buffer.byteLength(s);
		var offset = 0;

		if (len < 0x80) {
			data = new Buffer(len + 1);
			data[offset++] = len;
		} else if (len < 0x4000) {
			data = new Buffer(len + 2);
			len |= 0x8000;
			data[offset++] = (len >> 8) & 0xff;
			data[offset++] = len & 0xff;
		} else if (len < 0x200000) {
			data = new Buffer(len + 3);
			len |= 0xC00000;
			data[offset++] = (len >> 16) & 0xff;
			data[offset++] = (len >> 8) & 0xff;
			data[offset++] = len & 0xff;
		} else if (len < 0x10000000) {
			data = new Buffer(len + 4);
			len |= 0xE0000000;
			data[offset++] = (len >> 24) & 0xff;
			data[offset++] = (len >> 16) & 0xff;
			data[offset++] = (len >> 8) & 0xff;
			data[offset++] = len & 0xff;
		} else {
			data = new Buffer(len + 5);
			data[offset++] = 0xF0;
			data[offset++] = (len >> 24) & 0xff;
			data[offset++] = (len >> 16) & 0xff;
			data[offset++] = (len >> 8) & 0xff;
			data[offset++] = len & 0xff;
		}
		data.utf8Write(s, offset);
		return data;
	}

	/**
	 * Decodes the length of the data array
	 * @function
	 * @private
	 * @param {array} data - The data to dump
	 * @returns {array} length
	 */
	function decodeLength(data) { // Ported from the PHP API on the
		// Wiki. Thanks
		var idx = 0;
		var b = data[idx++];
		var len;
		if (b & 128) {
			if ((b & 192) === 128) {
				len = ((b & 63) << 8) + data[idx++];
			} else {
				if ((b & 224) === 192) {
					len = ((b & 31) << 8) + data[idx++];
					len = (len << 8) + data[idx++];
				} else {
					if ((b & 240) === 224) {
						len = ((b & 15) << 8) + data[idx++];
						len = (len << 8) + data[idx++];
						len = (len << 8) + data[idx++];
					} else {
						len = data[idx++];
						len = (len << 8) + data[idx++];
						len = (len << 8) + data[idx++];
						len = (len << 8) + data[idx++];
					}
				}
			}
		} else {
			len = b;
		}
		return [ idx, len ];
	}

	/**
	 * Dumps an array to 'debug' in hex format
	 * @function
	 * @private
	 * @param {array} data - The data to dump
	 */
	function hexDump(data) {
		var hex = [];
		var cref = [];
		var i = 0;
		for (var j = 0; j < data.length; j++) {
			i = j % 8;
			// m=ctrl.indexOf(data[j]);
			if ((data[j] < 20) || (data[j] > 126)) {
				cref[i] = '.';
			} else {
				cref[i] = String.fromCharCode(data[j]);
			}
			hex[i] = Number(data[j]).toString(16);
			while (hex[i].length < 2) {
				hex[i] = "0" + hex[i];
			}
			if (hex.length === 8) {
				debug("%d: %s    %s", j - 7, hex.join(' '), cref.join(''));
				hex = [];
				cref = [];
			}
		}
		if (i !== 8) {
			debug(hex.join(' ') + '    ' + cref.join(''));
			hex = [];
			cref = [];
		}
	}

	/**
	 * Creates a private boolean property and a getter[,setter]
	 * @function
	 * @private
	 * @param {object} object - The object in which the property should be created
	 * @param {string} name - The name of the property
	 * @param {boolean} initialValue - The property's initial value
	 * @param {boolean} allowSet - If true, the property can be set. TRhe value supplied
	 *           will be coerced to a boolean.
	 */
	function createBooleanProperty(object, name, initialValue, allowSet) {
		_(object)[name] = initialValue;
		var props = {
			get : function() {
				return _(object)[name];
			}
		};

		if (allowSet) {
			props.set = function(val) {
				_(object)[name] = !!val;
			};
		}

		Object.defineProperty(object, name, props);
	}

	/**
	 * Creates a private property and a getter[,setter]
	 * @function
	 * @private
	 * @param {object} object - The object in which the property should be created
	 * @param {string} name - The name of the property
	 * @param {*} initialValue - The property's initial value
	 * @param {boolean} allowSet - If true, the property can be set.
	 */
	function createProperty(object, name, initialValue, allowSet) {
		_(object)[name] = initialValue;
		var props = {
			get : function() {
				return _(object)[name];
			}
		};

		if (allowSet) {
			props.set = function(val) {
				_(object)[name] = val;
			};
		}

		Object.defineProperty(object, name, props);
	}

	/**
	 * Creates or returns a Connection object.
	 * @exports mikronode.MikroNode
	 * @class
	 * @param {string} host - The host name or ip address
	 * @param {string} user - The user name
	 * @param {string} password - The users password
	 * @param {object} options
	 * @returns {Connection}
	 */
	function MikroNode(host, user, password, options) {
		return new Connection(host, user, password, options);
	}

	/**
	 * Connection
	 * @exports mikronode.Connection
	 * @class
	 * @param {string} host - The host name or ip address
	 * @param {string} user - The user name
	 * @param {string} password - The users password
	 * @param {object} [options]
	 * @returns {Connection}
	 */
	function Connection(host, user, password, options) {
		this.hash = crypto.createHash('md5').update(host + user).digest('hex');
		// If we already have a connection, return the same one.
		options = options || {};
		// if (api._conn[this.hash]) return api._conn[this.hash];
		this.host = host;
		this.user = user;
		this.password = password;
		this.debug = options.debug || 0;
		this.port = options.port || 8728;
		this.timeout = options.timeout || 5;
		this.socket = null; // socket connection
		this.connected = false; // If we are connected.
		this.connecting = false; // If we are trying to connect.
		this.line = ''; // current line. When the line is built, the sentence
		// event is called.
		this.buffer = []; // buffer holding incoming stream from socket
		this.packet = []; // current packet
		this.channel = {}; // all channels in use
		this.trap = false; // we encountered a trap.
		this.error = {}; // Buffer errors
		this.closeOnDone = false; // when !done event is called, close the
		// connection.
		this.closeOnFatal = false; // when !fatal occurs, close the connection.
		this.datalen = 0; // Used to look-ahead to see if more data is available
		// after !done is received.
		// api._conn[this.hash]=this;

		this.status = 'New';
	}
	util.inherits(Connection, events.EventEmitter);

	Connection.prototype.sentence = function sentence(data, more) {
		if (this.debug > 2) {
			debug('Sentence:(' + more + ') data: ' + data);
		}

		if (this.fatal) { // our last message was a fatal error.
			// debug('Sentence: fatal error: '+data);
			this.packet.push(data);
			this.emit('fatal', this.packet, this);
			if (!this.closing) {
				this.close();
			}
			return;
		} else if (data === '!fatal') { // we were sent a fatal message... wait
			// for next sentence to get message.
			this.fatal = true;
		} else if (data === '!done') { // we got a done signal... but we could
			// be in a channel.
			this.packet = this.buffer;
			this.buffer = [];
			if (this.debug > 2) {
				debug('Sentence: Done Signal.');
			}
			if (this.trap) {// we previously caught a trap
				this.trap = false;
				var e = this.error;
				this.error = {};
				if (this.debug > 2) {
					debug('Sentence: Sending trap.');
				}
				this.emit('trap', e, this);
			} else {// no trap. Send general packet.
				if (!more) {
					if (this.debug > 2) {
						debug('Sentence: No more data in packet. Done.');
					}
					this.emit('done', this.packet);
				} else {
					if (this.debug > 2) {
						debug('Sentence: Could have a tag.');
					}
					this.nextTag = 1;
				}
			}
			// else
			// this.emit('done',this.packet,this.handler);
		} else if (/=ret=/.test(data)) {
			if (this.debug > 2) {
				debug('Sentence: Single return: ' + data);
			}
			this.buffer.push('!re');
			this.buffer.push(data);
			this.packet = this.buffer;
			this.buffer = [];
			this.nextTag = 1; // next could be a tag
		} else if (this.nextTag) { // We had a done event, this could be a tag.
			this.nextTag = 0;
			if (data.match(/\.tag/)) {// Check if we have a tag.
				var channel = data.substring(5);
				if (this.debug > 2) {
					debug('Sentence: Done channel ' + channel + '.');
				}
				if (this.trap) { // if we're in a trap, send trap globally, since
					// tag terminates a trap.
					this.trap = false;
					var et = this.error;
					this.error = {};
					if (this.debug > 2) {
						debug('Sentence: Sending trap.');
					}
					this.channel[channel].emit('trap', et, this.channel[channel]);
				}
				if (this.channel[channel]) {
					this.channel[channel]._done(this.packet);
				}
			} else {
				if (/=ret=/.test(data)) {
					this.nextTag = 1;
					if (this.packet.length) {
						this.packet.push('!re');
						this.packet.push(data);
					} else {
						this.buffer.push('!re');
						this.buffer.push(data);
						this.packet = this.buffer;
						this.buffer = [];
					}
					return;
				}
				this.packet = this.buffer;
				this.buffer = [];
				this.emit('done', this.packet, this);
				this.buffer.push(data);
			}
		} else if (data.match(/\.tag/)) { // Catch tags where it's not following
			// !done
			this.packet = this.buffer; // backup up the packet
			this.buffer = [];
			var channel = data.substring(5);
			if (this.trap) {// we previously caught a trap
				if (!this.channel[channel]) {
					return debug('ERROR: No channel for trap');
				}
				this.trap = false; // we're emitting the trap. Clear it.
				var et2 = this.error;
				this.error = {};
				if (this.channel[channel]) {
					if (this.debug > 2) {
						debug('Sentence: Sending trap in channel: ' + channel + " data:" + JSON.stringify(et2));
					}
					this.channel[channel].emit('trap', et2, this.channel[channel]);
				}
			} else // no trap. Send general packet.
			if (this.channel[channel]) {
				this.channel[channel]._data(this.packet);
			}
		} else if (this.trap) {
			var l = data.split(/=/);
			if (l.length > 1) {
				this.error[l[1]] = l[2];
				if (this.debug > 2) {
					debug('Sentence: Trap property: ' + l[1] + ' = ' + l[2]);
				}
			}
		} else if (data.match(/\!trap/)) {
			this.trap = true;
			if (this.debug > 2) {
				debug('Sentence: catching trap');
			}
		} else {
			this.buffer[this.buffer.length] = data;
		}
	};

	Connection.prototype.read = function read(data) {
		if (this.debug > 4) {
			hexDump(data);
			// debug('read: new packet:'+);
		}
		while (data.length) {
			if (this.debug > 3) {
				debug('read: data-len:' + data.length);
			}
			if (this.len) { // maintain the current data length. What if the data
				// comes in 2 separate packets?
				// I am hopping that the API on the other end doesn't send more than
				// one channel
				// at a time if more than one packet is required.
				// if (this.debug>3) debug('read: data:'+data);
				if (data.length <= this.len) {
					this.len -= data.length;
					this.line += data.toString();
					if (this.debug > 3) {
						debug('read:consume-all: data:' + data);
					}
					if (this.len === 0) {
						this.emit('sentence', this.line, (data.length !== this.len));
						this.line = '';
					}
					break;
				} else {
					if (this.debug > 3) {
						debug('read:consume len:(' + this.len + ') data: ' + data);
					}
					this.line += data.toString('utf8', 0, this.len);
					var l = this.line;
					this.line = '';
					data = data.slice(this.len);
					var x = decodeLength(data);
					this.len = x[1];
					data = data.slice(x[0]); // get rid of excess buffer
					if (this.len === 1 && data[0] === "\x00") {
						this.len = 0;
						data = data.slice(1); // get rid of excess buffer
					}
					this.emit('sentence', l, data.length);
				}
			} else {
				var y = decodeLength(data);
				this.len = y[1];
				data = data.slice(y[0]);
				if (this.len === 1 && data[0] === "\x00") {
					this.len = 0;
					data = data.slice(1); // get rid of excess buffer
				}
			}
		}
	};

	Connection.prototype.write = function write(a) { // This shouldn't be called
		// directly. Please use channels.
		if (!this.connected && !this.connecting) {
			if (this.debug > 2) {
				debug('write: not connected ');
			}
			return;
		}
		if (typeof (a) === 'string') {
			a = [ a ];
		} else if (!Array.isArray(a)) {
			return;
		}
		var self = this;
		a.forEach(function(i) {
			if (self.debug > 2) {
				debug('write: sending ' + i);
			}
			self.socket.write(encodeString(i));
		});
		this.socket.write(emptyString);
	};

	/*
	 * Connection.prototype.closeOnDone = function closeOnDone(b) { if (typeof (b) ===
	 * 'boolean') { this.closeOnDone = b; } return this.closeOnDone; };
	 */
	Connection.prototype.connected = function connected(b) {
		if (typeof (b) === 'boolean') {
			this.connected = b;
		}
		return this.connected;
	};

	Connection.prototype.getHost = function getHost() {
		return this.host;
	};

	Connection.prototype.getUser = function getUser() {
		return this.user;
	};

	Connection.prototype.setHost = function setHost(h) {
		if (this.connected) {
			return this;
		}
		this.host = h;
		return this;
	};

	Connection.prototype.closeOnFatal = function closeOnFatal(b) {
		if (typeof (b) === 'boolean') {
			if (!this.closeOnFatal && b) {
				this.closeOnFatal = b ? this.addListener('fatal', function(conn) {
					this.close();
				}) : false;
			} else if (!!this.closeOnFatal) {
				this.removeListener('fatal', this.closeOnFatal);
			}
		}
		return !!this.closeOnFatal;
	};

	Connection.prototype.connect = function connect(callBack) {
		if (this.connected) {
			return;
		}
		var _this = this;
		this.connectionCallback = callBack;
		this.status = "Connecting";
		this.addListener('fatal', function(conn) {
			this.close();
		});
		// this.addListener('trap',function(conn){self.close()});
		this.socket = new net.Socket({
			type : 'tcp4'
		});
		if (this.debug > 3) {
			debug('Connecting to ' + this.host);
		}
		this.connecting = true;
		this.socket.on('data', function(a) {
			_this.read(a);
		});
		this.socket.on('error', function(a) {
			if (_this.debug > 1) {
				debug('Connection error: ' + a);
			}
			_this.socket.destroy();
			_this.connected = false;
			_this.emit('error', a, _this);
			_this.emit('close', _this);
			_this.removeAllListeners();
		});
		// This will be called if there is no activity to the server.
		// If this occurs before the login is successful, it could be
		// that it is a connection timeout.
		this.socket.setTimeout(this.timeout * 1000, function(e) {
			if (_this.debug) {
				debug('Socket Timeout');
			}
			if (!_this.connected) {
				_this.emit('error', new Error('Timeout Connecting to host'));
			}
		});
		this.socket.setKeepAlive(true);
		this._connector();
		// While logging in, if an error occurs, we should kill the socket.
		// This will keep node from not terminating due to lingering
		// sockets.
		return this;
	};

	Connection.prototype._connector = function _connector() {
		var _this = this;
		this.loginHandler = function loginHandler(d) {
			if (_this.debug > 0) {
				debug('LoginHandler: ' + _this.status + ' : ' + _this.host);
			}
			switch (_this.status) {
			case 'Connecting':
				_this.status = 'Sending Login';
				if (_this.debug > 2) {
					debug(_this.status);
				}
				_this.write('/login');
				break;
			case 'Sending Login':
				if (d.length < 1) {
					return;
				}
				if (d === '!done') {
					if (_this.debug > 2) {
						debug('Got !done. Need challenge');
					}
					return; // waiting for challenge
				}
				if (/=ret=/.test(d)) {
					if (_this.debug > 3) {
						debug('Got challenge');
					}
					_this.status = 'Sending Credentials';
					if (_this.debug > 2) {
						debug(_this.status);
					}
					var challenge = '';
					var a = d.split('=')[2].split('');
					while (a.length) {
						challenge += String.fromCharCode(parseInt("0x" + a.shift() + a.shift()));
					}
					if (challenge.length !== 16) {
						_this.status = 'Error';
						if (_this.debug > 2) {
							debug(_this.status);
						}
						_this.error = 'Bad connection response: ' + d;
						if (_this.debug > 3) {
							debug('Challenge length:' + challenge.length);
						}
						if (_this.debug) {
							debug(_this.error);
						}
						_this.removeListener('sentence', _this.loginHandler);
						_this.close();
					} else {
						this
								.write([
										"/login",
										"=name=" + _this.user,
										"=response=00"
												+ crypto.createHash('md5').update(emptyString + _this.password + challenge).digest(
														"hex") ]);
					}
				}
				break;
			case 'Sending Credentials':
				if (_this.trap) {
					if (_this.trap === true) {
						_this.trap = {
							"TRAP" : "Logging in"
						};
					}
					if (d === '!done') {
						_this.emit('trap', _this.trap);
						_this.trap = false;
						_this.status = "Connecting";
						return;
					} else {
						d = d.split(/=/); // Catch multiple trap return keys.
						if (d.length > 2) {
							_this.trap[d[1]] = d[2];
						}
					}
				} else if (d === '!done') {
					_this.status = 'Connected';
					_this.removeAllListeners('sentence');
					_this.removeAllListeners('fatal');
					_this.removeAllListeners('trap');
					_this.addListener('sentence', function(data, more) {
						_this.sentence(data, more);
					});
					if (_this.debug > 2) {
						debug(_this.status);
					}
					_this.connected = true;
					if (_this.connectionCallback) {
						_this.connectionCallback(this);
						_this.connectionCallback = null;
					}
				} else {
					if (d === '!trap') {
						return (_this.trap = true);
					}
					if (_this.debug > 2) {
						debug(_this.status);
					}
					_this.sentence(d); // start off trap processing.
				}
				break;
			case 'Connected':
				_this.removeListener('sentence', _this.loginHandler);
			}
		};
		this.addListener('sentence', this.loginHandler);
		this.socket.connect(this.port, this.host, this.loginHandler);
	};

	Connection.prototype.openChannel = function openChannel(id) {
		if (!id) {
			id = Object.keys(this.channel).length + 1;
			while (this.channel[id]) {
				id++;
			}
		} else if (this.channel[id]) {
			throw ('Channel already exists for ID ' + id);
		}
		if (this.debug > 0) {
			debug('Opening channel: ' + id);
		}
		var o = this.channel[id] = new Channel(id, this);
		var _this = this;
		o.addListener('close', function() {
			if ((_this.closing || _this.closeOnDone) && Object.keys(_this.channel).length) {
				_this.close();
			}
		});
		return o;
	};

	Connection.prototype.getChannel = function getChannel(id) {
		if (!id && id !== 0) {
			throw ('Missing channel ID parameter' + id);
		}
		if (!this.channel[id]) {
			throw ('Channel does not exist ' + id);
		}
		if (this.debug > 0) {
			debug('Getting channel: ' + id);
		}
		return this.channel[id];
	};

	Connection.prototype.closeChannel = function closeChannel(id) {
		if (!id) {
			throw ("Missing ID for stream channel to close.");
		}
		if (!this.channel[id]) {
			throw ('Channel does not exist for ID ' + id);
		}
		// Make sure that the channel closes itself... so that remaining
		// commands will execute.
		if (!this.channel[id].closed) {
			return this.channel[id].close();
		}
		if (this.debug > 0) {
			debug('Closing ' + this.getHost() + ' channel: ' + id);
		}
		delete this.channel[id];
		if (Object.keys(this.channel).length === 0 && (this.closing || this.closeOnDone)) {
			this.close();
		}
	};

	Connection.prototype.close = function close(force) {
		var _this = this;
		if (!this.connected) {
			if (this.debug > 0) {
				debug('Connection disconnected: ' + this.getHost());
			}
			this.socket.destroy();
			this.connected = false;
			this.removeAllListeners();
			this.emit('close', this);
			this.removeAllListeners();
			return;
		}
		if (!force && (Object.keys(this.channel).length > 0)) {
			this.closing = true;
			if (this.debug > 1) {
				console.log('deferring closing connection');
			}
			return;
		}
		if (this.debug > 0) {
			debug('Connection disconnecting: ' + this.getHost());
		}
		this.removeAllListeners('done');
		if (force) {
			Object.keys(this.channel).forEach(function(e) {
				_this.channel[e].close(true);
			});
		}
		this.once('fatal', function(d) { // quit command ends with a fatal.
			if (this.debug > 0) {
				debug('Connection disconnected: ' + this.getHost());
			}
			this.socket.destroy();
			this.connected = false;
			this.removeAllListeners();
			_this.emit('close', _this);
			_this.removeAllListeners();
		});
		this.closing = false;
		// delete api._conn[this.hash];
		this.write([ '/quit' ]);
		this.closing = true;
	};

	Connection.prototype.finalize = function finalize() {
		this.close(true);
	};

	/**
	 * channelPromise
	 * @param {string} command - the command to run
	 * @param {object} DestinationClass - A class to instantiate with the parsed item.
	 */
	Connection.prototype.channelPromise = function channelPromise(command, DestinationClass) {
		var _this = this;
		return new Promise(function(resolve, reject) {
			try {
				/**
				 * @type {mikronode.Channel}
				 */
				var chan = _this.openChannel();
				chan.closeOnDone = true;
				var items = [];
				chan.write(command, function() {
					chan.on('done', function chanDone(data) {
						var parsed = MikroNode.parseItems(data);
						parsed.forEach(function(item) {
							items.push(new DestinationClass(item));
						});
						resolve(items);
					});
				});
			} catch (err) {
				reject(err);
			}
		});
	};

	/**
	 * Parse !re return records into an array of objects
	 * @function
	 * @param {string[]} data - The data[] returned from Channel.on('done')
	 * @returns {object[]}
	 */
	MikroNode.parseItems = function parseItems(data) {
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
	 * writeCallback
	 * @callback mikronode.Channel.writeCallback
	 * @param {Channel}
	 */

	/**
	 * Channel
	 * @exports mikronode.Channel
	 * @class
	 * @param {number} id
	 * @param {Connection} conn
	 */
	function Channel(id, conn) {

		/**
		 * Channel ID
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} connection
		 * @memberof mikronode.Channel
		 */
		createProperty(this, 'id', id, false);
		/**
		 * Connection
		 * @public
		 * @readonly
		 * @instance
		 * @member {mikronode.Connection} connection
		 * @memberof mikronode.Channel
		 */
		createProperty(this, 'connection', conn, false);
		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} running
		 * @memberof mikronode.Channel
		 */
		createBooleanProperty(this, 'running', false, false);
		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} closing
		 * @memberof mikronode.Channel
		 */
		createBooleanProperty(this, 'closing', false, false);
		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} closed
		 * @memberof mikronode.Channel
		 */
		createBooleanProperty(this, 'closed', false, false);

		/**
		 * Clear events
		 * @public
		 * @instance
		 * @member {boolean} clearEvents
		 * @memberof mikronode.Channel
		 */
		this.clearEvents = false;
		/**
		 * @public
		 * @instance
		 * @member {boolean} saveBuffer
		 * @memberof mikronode.Channel
		 */
		this.saveBuffer = true;
		/**
		 * @public
		 * @instance
		 * @member {boolean} closeOnDone
		 * @memberof mikronode.Channel
		 */
		this.closeOnDone = false;

		/**
		 * @private
		 * @instance
		 * @member {mikronode.Channel.writeCallback} writeCallback
		 * @memberof mikronode.Channel
		 */
		_(this).writeCallback = null;
		/**
		 * @private
		 * @instance
		 * @member {array} packet
		 * @memberof mikronode.Channel
		 */
		_(this).packet = [];
		/**
		 * @private
		 * @instance
		 * @member {array} commands
		 * @memberof mikronode.Channel
		 */
		_(this).commands = [];
		/**
		 * @private
		 * @instance
		 * @member {array} buffer
		 * @memberof mikronode.Channel
		 */
		_(this).buffer = [];
	}
	util.inherits(Channel, events.EventEmitter);

	/**
	 * Done event.
	 * @event mikronode.Channel#event:done
	 * @type {object}
	 * @property {(string|string[])} data - The data returned by the channel
	 * @property {Channel} channel - The channel originating the event
	 */
	/**
	 * Writes data to the channel
	 * @param {(string|string[])} d
	 * @param {mikronode.Channel.writeCallback} writeCallback
	 * @fires mikronode.Channel#event:done
	 */
	Channel.prototype.write = function write(d, writeCallback) {
		if (_(this).closing) {
			return;
		}
		if (d) {
			if (typeof (d) === 'string') {
				d = d.split("\n");
			}
			if (Array.isArray(d) && d.length) {
				_(this).buffer = _(this).buffer.concat(d);
			} else {
				return;
			}
		} else {
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.getHost() + ":" + _(this).id + ') write: empty arg.');
			}
		}
		if (_(this).running) {
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.getHost() + ":" + _(this).id + ') write: pushing command.');
			}
			_(this).commands.push([ _(this).buffer, writeCallback ]);
			_(this).buffer = [];
		} else {
			var b = _(this).buffer;
			_(this).running = true;
			this.saveBuffer = true;
			_(this).buffer = [];
			b.push('.tag=' + _(this).id);
			if (writeCallback) {
				writeCallback(this);
			}
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.getHost() + ":" + _(this).id + ') write lines: ' + JSON.stringify(b));
			}
			_(this).connection.write(b); // Send command.
		}
	};

	/**
	 * Called when connection gets 'done'
	 * @private
	 * @param {(string|string[])} data
	 * @fires mikronode.Channel#event:done
	 */
	Channel.prototype._done = function _done(data) {
		if (_(this).connection.debug > 0) {
			debug('Channel done: (' + _(this).connection.getHost() + ":" + _(this).id + ')');
		}
		var p = _(this).packet;
		_(this).packet = [];
		if (!p.length) {
			p = [ data ];
		} else if (p[p.length - 1] !== data) {
			p.push(data);
		}
		this.emit('done', p, this);
		if (this.clearEvents) {
			this.removeAllListeners('done');
			this.removeAllListeners('data');
			this.removeAllListeners('read');
		}
		_(this).running = false;
		if (_(this).commands.length) {
			var c = _(this).commands.shift();
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.getHost() + ":" + _(this).id + ') buffered commands('
						+ (_(this).commands.length + 1) + '): ' + JSON.stringify(c));
			}
			var cl = _(this).closing;
			_(this).closing = false;
			this.write(c[0], c[1]);
			_(this).closing = cl;
		} else if (_(this).closing || this.closeOnDone) {
			this.close();
		}
	};

	/**
	 * Called when connection gets 'data'
	 * @private
	 * @param {(string|string[])} data
	 */
	Channel.prototype._data = function _data(data) {
		if (_(this).connection.debug > 2) {
			debug('Channel data: ' + data);
		}
		if (this.saveBuffer) {
			_(this).packet.push(data);
		}
		this.emit('data', [ data ], this);
		this.emit('read', [ data ], this);
	};

	/**
	 * Closes the channel
	 * @public
	 * @param {boolean} force - Force close
	 */
	Channel.prototype.close = function close(force) { // Close _(this) channel.
		_(this).closing = true;
		if (_(this).closed || (!force && (_(this).commands.length || _(this).running))) {
			return;
		}
		if (_(this).running) {
			_(this).connection.write([ '/cancel', '=tag=' + _(this).id ]);
		}
		if (_(this).connection.debug > 1) {
			debug('Closing host:channel: ' + _(this).connection.getHost() + ':' + _(this).id);
		}
		_(this).closed = true;
		_(this).connection.closeChannel(_(this).id);
		this.emit('close', this);
	};

	/**
	 * Closes the channel (no force)
	 * @public
	 */
	Channel.prototype.finalize = function finalize() {
		if (_(this).connection.debug > 3) {
			debug('Channel Finalize: ' + _(this).id);
		}
		if (!_(this).closing) {
			this.close();
		}
	};

	Object.seal(MikroNode);
	Object.seal(Connection);
	Object.seal(Channel);

	return MikroNode;

})();
