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
	 * @param {boolean} [allowSet=false] - If true, the property can be set.
	 * @param {boolean} [needPrivate=true] - If true, a private property in the form of
	 *           _(object)[name] will be created. This can be set by anyone with a
	 *           reference to 'object' even setting by this[name] isn't allowed.
	 */
	function createBooleanProperty(object, name, initialValue, allowSet, needPrivate) {
		if (needPrivate === undefined || needPrivate) {
			_(object)[name] = initialValue;
		}
		var props = {
			enumerable : true,
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
	 * @param {boolean} [allowSet=false] - If true, the property can be set.
	 * @param {boolean} [needPrivate=true] - If true, a private property in the form of
	 *           _(object)[name] will be created. This can be set by anyone with a
	 *           reference to 'object' even setting by this[name] isn't allowed.
	 */
	function createProperty(object, name, initialValue, allowSet, needPrivate) {
		if (needPrivate === undefined || needPrivate) {
			_(object)[name] = initialValue;
		}
		var props = {
			enumerable : true,
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
	 * @param {object} options
	 * @returns {mikronode.Connection}
	 */
	MikroNode.getConnection = function getConnection(host, user, password, options) {
		return new Connection(host, user, password, options);
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
	 * Trap
	 * @exports mikronode.Trap
	 * @class
	 * @param {string} [message]
	 */
	function Trap(message) {
		/**
		 * @property {string} message
		 */
		this.message = message || '';
		/**
		 * @property {string} [category]
		 */
		this.category = '';
		/**
		 * @property {string} [channelId]
		 */
		this.channelId = '';
		/**
		 * @property {mikronode.Channel} [channel]
		 */
		this.channel = null;

		this.toString = function() {
			return this.message;
		};
	}

	/**
	 * Connection
	 * @exports mikronode.Connection
	 * @class
	 * @param {string} host - The host name or ip address
	 * @param {string} user - The user name
	 * @param {string} password - The users password
	 * @param {object} [options]
	 */
	function Connection(host, user, password, options) {
		this.hash = crypto.createHash('md5').update(host + user).digest('hex');
		// If we already have a connection, return the same one.
		options = options || {};
		// if (api._conn[this.hash]) return api._conn[this.hash];

		createProperty(this, 'host', host, false);
		createProperty(this, 'user', user, false);
		createProperty(this, 'password', password, false);
		createProperty(this, 'port', options.port || 8728, false);
		createProperty(this, 'timeout', options.timeout || 5, false);
		createProperty(this, 'status', 'New', false);

		createBooleanProperty(this, 'connected', false, false);
		createBooleanProperty(this, 'connecting', false, false);
		createBooleanProperty(this, 'closeOnDone', options.closeOnDone || false, true);
		createBooleanProperty(this, 'closeOnTimeout', options.closeOnTimeout || false, true);

		this.debug = options.debug || 0;

		_(this).closeOnFatal = false;
		_(this).socket = null; // socket connection
		_(this).line = ''; // current line. When the line is built, the sentence
		// event is called.
		_(this).buffer = []; // buffer holding incoming stream from socket
		_(this).packet = []; // current packet
		_(this).channel = {}; // all channels in use
		_(this).trap = false; // we encountered a trap.
		_(this).error = {}; // Buffer errors
		_(this).datalen = 0; // Used to look-ahead to see if more data is available
		// after !done is received.
		// api._conn[this.hash]=this;
		_(this).loginHandler = null;

	}
	util.inherits(Connection, events.EventEmitter);

	/**
	 * Called when a sentence arrives
	 * @private
	 * @param {string} data - Sentence
	 * @param {boolean} more - unused
	 * @this mikronode.Connection
	 */
	Connection.prototype.sentence = function sentence(data, more) {
		if (this.debug > 2) {
			debug('Sentence:(' + more + ') data: ' + data);
		}

		if (_(this).fatal) { // our last message was a fatal error.
			// debug('Sentence: fatal error: '+data);
			_(this).packet.push(data);
			this.emit('fatal', _(this).packet, this);
			if (!_(this).closing) {
				this.close();
			}
			return;
		} else if (data === '!fatal') {
			// we were sent a fatal message... wait
			// for next sentence to get message.
			_(this).fatal = true;
		} else if (data === '!done') {
			// we got a done signal... but we could
			// be in a channel.  A .tag may be forthcoming.
			_(this).packet = _(this).buffer;
			_(this).buffer = [];
			if (this.debug > 2) {
				debug('Sentence: Done Signal.');
			}
			if (_(this).trap) {// we previously caught a trap
				if (!_(this).trap.channelId) {
					if (this.debug > 2) {
						debug('Sentence: No channels.  Sending trap to connection.');
					}
					this.emit('trap', _(this).trap, this);
					_(this).trap = false;
				} else {
					if (this.debug > 2) {
						debug('Sentence: Saving done on trap for channel ' + _(this).trap.channelId);
					}
					_(this).trap.done = true;
					_(this).nextTag = 1;
				}
			} else {// no trap. Send general packet.
				if (!more) {
					if (this.debug > 2) {
						debug('Sentence: No more data in packet. Done.');
					}
					this.emit('done', _(this).packet);
				} else {
					if (this.debug > 2) {
						debug('Sentence: Could have a tag.');
					}
					_(this).nextTag = 1;
				}
			}
		} else if (/=ret=/.test(data)) {
			if (this.debug > 2) {
				debug('Sentence: Single return: ' + data);
			}
			_(this).buffer.push('!re');
			_(this).buffer.push(data);
			_(this).packet = _(this).buffer;
			_(this).buffer = [];
			_(this).nextTag = 1; // next could be a tag
		} else if (_(this).nextTag) { // We had a done event, this could be a tag.
			_(this).nextTag = 0;
			if (data.match(/\.tag/)) {// Check if we have a tag.
				var channel = data.substring(5);
				if (this.debug > 2) {
					debug('Sentence: Done channel ' + channel + '.');
				}
				if (_(this).channel[channel]) {
					_(this).channel[channel]._done(_(this).packet, _(this).trap);
					_(this).trap = false;
				}
			} else {
				if (/=ret=/.test(data)) {
					_(this).nextTag = 1;
					if (_(this).packet.length) {
						_(this).packet.push('!re');
						_(this).packet.push(data);
					} else {
						_(this).buffer.push('!re');
						_(this).buffer.push(data);
						_(this).packet = _(this).buffer;
						_(this).buffer = [];
					}
					return;
				}
				_(this).packet = _(this).buffer;
				_(this).buffer = [];
				this.emit('done', _(this).packet, this);
				_(this).buffer.push(data);
			}
		} else if (data.match(/\.tag/)) { // Catch tags where it's not following
			// !done
			_(this).packet = _(this).buffer; // backup up the packet
			_(this).buffer = [];
			var tagChannelId = data.substring(5);
			if (_(this).trap) {// we previously caught a trap
				if (this.debug > 2) {
					debug('Sentence: assigned ' + tagChannelId + ' to trap');
				}
				_(this).trap.channelId = tagChannelId;
				_(this).trap.channel = _(this).channel[tagChannelId];
			} else {
				if (_(this).channel[tagChannelId]) {
					_(this).channel[tagChannelId]._data(_(this).packet);
				}
			}
		} else if (data.match(/\!trap/)) {
			_(this).trap = new Trap();
			if (this.debug > 2) {
				debug('Sentence: caught a trap');
			}
		} else if (_(this).trap) {
			if (/=message=/.test(data)) {
				if (this.debug > 2) {
					debug('Sentence: caught trap message: ' + data.substr(9));
				}
				_(this).trap.message = data.substr(9);
			} else if (/=category=/.test(data)) {
				if (this.debug > 2) {
					debug('Sentence: caught trap category: ' + data.substr(10));
				}
				_(this).trap.category = data.substr(10);
			}
		} else {
			_(this).buffer[_(this).buffer.length] = data;
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
			if (_(this).len) { // maintain the current data length. What if the data
				// comes in 2 separate packets?
				// I am hopping that the API on the other end doesn't send more than
				// one channel
				// at a time if more than one packet is required.
				// if (this.debug>3) debug('read: data:'+data);
				if (data.length <= _(this).len) {
					_(this).len -= data.length;
					_(this).line += data.toString();
					if (this.debug > 3) {
						debug('read:consume-all: data:' + data);
					}
					if (_(this).len === 0) {
						this.emit('sentence', _(this).line, (data.length !== _(this).len));
						_(this).line = '';
					}
					break;
				} else {
					if (this.debug > 3) {
						debug('read:consume len:(' + _(this).len + ') data: ' + data);
					}
					_(this).line += data.toString('utf8', 0, _(this).len);
					var l = _(this).line;
					_(this).line = '';
					data = data.slice(_(this).len);
					var x = decodeLength(data);
					_(this).len = x[1];
					data = data.slice(x[0]); // get rid of excess buffer
					if (_(this).len === 1 && data[0] === "\x00") {
						_(this).len = 0;
						data = data.slice(1); // get rid of excess buffer
					}
					this.emit('sentence', l, data.length);
				}
			} else {
				var y = decodeLength(data);
				_(this).len = y[1];
				data = data.slice(y[0]);
				if (_(this).len === 1 && data[0] === "\x00") {
					_(this).len = 0;
					data = data.slice(1); // get rid of excess buffer
				}
			}
		}
	};

	Connection.prototype.write = function write(a) {
		var _this = this;
		if (!_(this).connected && !_(this).connecting) {
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
		a.forEach(function(i) {
			if (_this.debug > 2) {
				debug('write: sending ' + i);
			}
			_(_this).socket.write(encodeString(i));
		});
		_(this).socket.write(emptyString);
	};

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
		// this.addListener('trap',function(conn){self.close()});
		_(this).socket = new net.Socket({
			type : 'tcp4'
		});
		if (this.debug > 3) {
			debug('Connecting to ' + _(this).host);
		}
		_(this).connecting = true;
		_(this).socket.on('data', function(a) {
			/*
			 * @this Socket
			 */
			_this.read(a);
		});
		_(this).socket.on('error', function(a) {
			if (_this.debug > 1) {
				debug('Connection error: ' + a);
			}
			_(_this).socket.destroy();
			_(_this).connected = false;
			_this.emit('error', a, _this);
			_this.emit('close', _this);
			_this.removeAllListeners();
		});
		_(this).socket.on('timeout', function(a) {
			if (_this.debug > 1) {
				debug('Timeout: ' + a);
			}
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

		// This will be called if there is no activity to the server.
		// If this occurs before the login is successful, it could be
		// that it is a connection timeout.
		_(this).socket.setTimeout(_(this).timeout * 1000);
		_(this).socket.setKeepAlive(true);
		this._connector();
		// While logging in, if an error occurs, we should kill the socket.
		// This will keep node from not terminating due to lingering
		// sockets.
		return this;
	};

	Connection.prototype._connector = function _connector() {
		var _this = this;
		_(this).loginHandler = function loginHandler(d) {
			if (_this.debug > 0) {
				debug('LoginHandler: ' + _(_this).status + ' : ' + _(_this).host);
			}
			switch (_(_this).status) {
			case 'Connecting':
				_(_this).status = 'Sending Login';
				if (_this.debug > 2) {
					debug(_(_this).status);
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
					_(_this).status = 'Sending Credentials';
					if (_this.debug > 2) {
						debug(_(_this).status);
					}
					var challenge = '';
					var a = d.split('=')[2].split('');
					while (a.length) {
						challenge += String.fromCharCode(parseInt("0x" + a.shift() + a.shift()));
					}
					if (challenge.length !== 16) {
						_(_this).status = 'Error';
						if (_this.debug > 2) {
							debug(_(this).status);
						}
						_(_this).error = 'Bad connection response: ' + d;
						if (_this.debug > 3) {
							debug('Challenge length:' + challenge.length);
						}
						if (_this.debug) {
							debug(_(_this).error);
						}
						_this.removeListener('sentence', _this.loginHandler);
						_this.close();
					} else {
						this.write([
								"/login",
								"=name=" + _(_this).user,
								"=response=00"
										+ crypto.createHash('md5').update(emptyString + _(this).password + challenge).digest(
												"hex") ]);
					}
				}
				break;
			case 'Sending Credentials':
				if (_(_this).trap) {
					if (_(_this).trap === true) {
						_(_this).trap = {
							"TRAP" : "Logging in"
						};
					}
					if (d === '!done') {
						_this.emit('trap', _(this).trap);
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
					if (_this.debug > 2) {
						debug(_(this).status);
					}
					_(_this).connected = true;
					if (_(_this).connectionCallback) {
						_(_this).connectionCallback(this);
						_(_this).connectionCallback = null;
					}
				} else {
					if (d === '!trap') {
						if (_this.debug > 2) {
							debug('Login Trap' + d);
						}
						_this.removeListener('sentence', _(this).loginHandler);
						_(_this).trap = {};
						_this.addListener('sentence', function(data, more) {
							_this.sentence(data, more);
						});
						_this.sentence(d); // start off trap processing.
					}
					if (_this.debug > 2) {
						debug(_(_this).status);
					}
				}
				break;
			case 'Connected':
				_this.removeListener('sentence', _this.loginHandler);
			}
		};
		this.addListener('sentence', _(this).loginHandler);
		_(this).socket.connect(_(this).port, _(this).host, _(this).loginHandler);
	};

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
		if (this.debug > 0) {
			debug('Opening channel: ' + id);
		}
		_(this).channel[id] = new Channel(id, this);
		_(this).channel[id].addListener('close', function(channel) {
			_this.closeChannel(channel.id);
		});
		return _(this).channel[id];
	};

	Connection.prototype.getChannel = function getChannel(id) {
		if (!id && id !== 0) {
			throw ('Missing channel ID parameter' + id);
		}
		if (!_(this).channel[id]) {
			throw ('Channel does not exist ' + id);
		}
		if (this.debug > 0) {
			debug('Getting channel: ' + id);
		}
		return _(this).channel[id];
	};

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
		if (this.debug > 0) {
			debug('Closing ' + _(this).host + ' channel: ' + id + " COD: " + _(this).closeOnDone);
		}
		delete _(this).channel[id];
		if (Object.keys(_(this).channel).length === 0 && (_(this).closing || _(this).closeOnDone)) {
			this.close();
		}
	};

	Connection.prototype.close = function close(force) {
		var _this = this;
		if (!_(this).connected) {
			if (this.debug > 0) {
				debug('Connection disconnected: ' + _(this).host);
			}
			_(this).socket.destroy();
			_(this).connected = false;
			this.removeAllListeners();
			this.emit('close', this);
			this.removeAllListeners();
			return;
		}
		if (!force && (Object.keys(_(this).channel).length > 0)) {
			_(this).closing = true;
			if (this.debug > 1) {
				console.log('deferring closing connection');
			}
			return;
		}
		if (this.debug > 0) {
			debug('Connection disconnecting: ' + _(this).host);
		}
		this.removeAllListeners('done');
		this.removeAllListeners('error');
		this.removeAllListeners('timeout');

		if (force) {
			Object.keys(_(this).channel).forEach(function(e) {
				_(_this).channel[e].close(true);
			});
		}
		this.once('fatal', function() { // quit command ends with a fatal.
			if (_this.debug > 0) {
				debug('Connection disconnected: ' + _(this).host);
			}
			_(_this).socket.destroy();
			_(_this).connected = false;
			_this.removeAllListeners();
			_this.emit('close', _this);
		});
		_(this).closing = false;
		// delete api._conn[_(this).hash];
		this.write([ '/quit' ]);
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
	 * {@link mikronode.Connection}. If rejected, the result object will be an Error if
	 * there was a socket error or timeout during connection or login or a
	 * {@link mikronode.Trap} if there was a problem with the login credentials.
	 * <p>
	 * @returns {Promise}
	 */
	Connection.prototype.connectPromise = function connectPromise() {
		var _this = this;
		return new Promise(function(resolve, reject) {
			try {

				_this.on('error', function(err) {
					reject(err);
					_this.close();
				});
				_this.on('trap', function(err) {
					reject(err);
					_this.close();
				});

				_this.connect(function connect(connection) {
					resolve(connection);
				});
			} catch (err) {
				reject(err);
			}
		});
	};

	/**
	 * Returned a Promise of a completed command.
	 * <p>
	 * The promise will resolve when the command completes or reject if there's an error or
	 * trap. If resolved, the result will be an array of instances of DestinationClass (or
	 * Object, if no destination class was specified). If rejected, the result will be an
	 * Error if there was a socket error or timeout, or a {@link mikronode.Trap} if the
	 * command failed on the device.
	 * 
	 * @param {(string|string[])} data - Can be a single string with the command and
	 *           parameters separated by '\n' or an array of strings with the command in
	 *           the first position and the parameters in the rest.
	 * @param {object} [parameters] - If the first parameter is a command string, this
	 *           object will be treated as the parameters for the string.
	 * @param {function} [DestinationClass=object] - A class to instantiate for each parsed
	 *           item. The properties returned from the device will then be added to the
	 *           object. If no destinationClass is specified, a plain Object will be
	 *           created and returned.
	 * @returns {Promise}
	 */
	Connection.prototype.commandPromise = function commandPromise(data, parameters, DestinationClass) {
		var _this = this;
		return new Promise(function(resolve, reject) {
			try {
				if (typeof parameters === 'function' && !DestinationClass) {
					DestinationClass = parameters;
				}
				if (!DestinationClass) {
					DestinationClass = Object;
				}
				var chan = _this.openChannel();
				chan.closeOnDone = true;
				chan.write(data, parameters, function() {
					chan.on('error', function(err) {
						if (chan.connection.debug > 2) {
							debug('Channel %d error: ', chan.id, err);
						}
						reject(err);
						chan.close();
					});
					chan.on('trap', function(err) {
						if (chan.connection.debug > 2) {
							debug('Channel %d trap: ', chan.id, err);
						}
						reject(err);
					});
					chan.on('timeout', function(err) {
						if (chan.connection.debug > 2) {
							debug('Channel %d timeout: ', chan.id, err);
						}
						reject(err);
					});
					chan.on('done', function chanDone(data) {
						var items = [];
						var parsed = MikroNode.parseItems(data);
						parsed.forEach(function(item) {
							var o = new DestinationClass();
							Object.keys(item).forEach(function(k) {
								o[k] = item[k];
							});
							items.push(o);
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
	 * writeCallback
	 * @callback mikronode.Channel.writeCallback
	 * @param {Channel}
	 */

	/**
	 * Emitted when a command has finished successfully.
	 * @event mikronode.Channel#event:done
	 * @property {(string|string[])} data - The data returned by the channel
	 * @property {Channel} channel - The channel originating the event Fatal event.
	 */
	/**
	 * Emitted when a non-recoverable error has occurred on the socket. No further commands
	 * can be processed on any channel.
	 * @event mikronode.Channel#event:error
	 * @property {error} error - The error object
	 * @property {Channel} channel - The channel originating the event
	 */
	/**
	 * Emitted when a socket has been idle too long.
	 * @event mikronode.Channel#event:timeout
	 * @property {string} message - 'Socket Timeout'
	 * @property {boolean} socketStillOpen - If true, communications can continue
	 * @property {Channel} channel - The channel originating the event
	 */
	/**
	 * Emitted when the channel is closed either by an explicit call to
	 * {@link mikronode.Channel#close} or when the channel is closed automatically via
	 * {@link mikronode.Channel#closeOnDone}
	 * @event mikronode.Channel#event:close
	 * @property {Channel} channel - The channel originating the event
	 */
	/**
	 * Emitted when a command has failed. Subsequent commands may succeed.
	 * @event mikronode.Channel#event:trap
	 * @property {object} trap - The error object
	 * @property {numeric} trap.category - The category of the error
	 * @property {string} trap.message - The message
	 * @property {string} trap.channelId - The id of channel originating the event
	 * @property {mikronode.Channel} trap.channel - The channel originating the event
	 */

	/**
	 * Channel
	 * @exports mikronode.Channel
	 * @implements {EventEmitter}
	 * @class
	 * @param {number} id
	 * @param {mikronode.Connection} conn
	 */
	function Channel(id, conn) {

		/**
		 * Channel ID
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} id
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
		 * @public
		 * @readonly
		 * @instance
		 * @member {string[]} lastCommand
		 * @memberof mikronode.Channel
		 */
		this.lastCommand = [];

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

		/* We want connection errors to propogate down to
		 * the channel so they can be caught by a channel promise
		 */
		var _this = this;
		/* A 'fatal' event is thrown when there's a fatal response
		 * from the device for a command.  The connection is closed.
		 */
		conn.once('fatal', function(err) {
			_this.emit('fatal', err, _this);
			_this.close(true);
		});

		/* A 'error' and 'timeout' events are thrown by Socket
		 * and are non-recoverable so we force close the channel. 
		 */
		conn.once('error', function(err) {
			_this.emit('error', err, _this);
			_this.close(true);
		});

		conn.once('timeout', function(message, socketStillOpen) {
			_this.emit('timeout', message, socketStillOpen, _this);
			if (!socketStillOpen) {
				_this.close(true);
			} else {
				conn.once('timeout', this);
			}
		});

	}
	util.inherits(Channel, events.EventEmitter);

	/**
	 * Writes data to the channel
	 * @param {(string|string[])} data - Can be a single string with the command and
	 *           parameters separated by '\n' or an array of strings with the command in
	 *           the first position and the parameters in the rest.
	 * @param {object} [parameters] - If the first parameter is a command string, this
	 *           object will be treated as the parameters for the string.
	 * @param {mikronode.Channel.writeCallback} [writeCallback] - This will be called just
	 *           before write actually writes the data to the connection.
	 * @fires mikronode.Channel#event:done
	 * @fires mikronode.Channel#event:trap
	 * @fires mikronode.Channel#event:error
	 * @fires mikronode.Channel#event:timeout
	 */
	Channel.prototype.write = function write(d, parameters, writeCallback) {
		if (_(this).closing) {
			return;
		}
		if (d) {
			if (typeof (d) === 'string') {
				d = d.split("\n");
				if (parameters instanceof Object) {
					Object.keys(parameters).forEach(function(k) {
						d.push(k + '=' + parameters[k]);
					});
				} else if (typeof parameters === 'function' && writeCallback === undefined) {
					writeCallback = parameters;
				}
			}
			if (Array.isArray(d) && d.length) {
				_(this).buffer = _(this).buffer.concat(d);
			} else {
				return;
			}
		} else {
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.host + ":" + _(this).id + ') write: empty arg.');
			}
		}
		if (_(this).running) {
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.host + ":" + _(this).id + ') write: pushing command.');
			}
			this.lastCommand = _(this).buffer;
			_(this).commands.push([ _(this).buffer, writeCallback ]);
			_(this).buffer = [];
		} else {
			this.lastCommand = _(this).buffer;
			var b = _(this).buffer;
			_(this).running = true;
			this.saveBuffer = true;
			_(this).buffer = [];
			b.push('.tag=' + _(this).id);
			if (writeCallback) {
				writeCallback(this);
			}
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.host + ":" + _(this).id + ') write lines: ' + JSON.stringify(b));
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
	Channel.prototype._done = function _done(data, trap) {
		if (_(this).connection.debug > 0) {
			debug('Channel done: (' + _(this).connection.host + ":" + _(this).id + ')');
		}

		if (trap) {
			this.emit('trap', trap, this);
		} else {
			var p = _(this).packet;
			_(this).packet = [];
			if (!p.length) {
				p = [ data ];
			} else if (p[p.length - 1] !== data) {
				p.push(data);
			}
			this.emit('done', p, this);
		}

		if (this.clearEvents) {
			this.removeAllListeners('done');
			this.removeAllListeners('data');
			this.removeAllListeners('read');
		}
		_(this).running = false;
		if (_(this).commands.length) {
			var c = _(this).commands.shift();
			if (_(this).connection.debug > 0) {
				debug('Channel (' + _(this).connection.host + ":" + _(this).id + ') buffered commands('
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
	 * Closes the channel This will close the connection if
	 * {@link mikronode.Connection#closeOnDone} was set and this was the last channel to
	 * close.
	 * @public
	 * @param {boolean} force - Force close even of there are other commands pending.
	 *           Otherwise mark the channel as 'closing' which will prevent new commands
	 *           from being started but will let queued ones finish.
	 * @fires {mikronode.Channel#event:close}
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
			debug('Closing host:channel: ' + _(this).connection.host + ':' + _(this).id);
		}
		_(this).closed = true;
		this.emit('close', this);
		this.removeAllListeners();
	};

	/**
	 * Calls {@link mikronode.Channel#close}(false)
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
