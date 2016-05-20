var events = require('events');
var crypto = require('crypto');
var util = require('util');
var dbg = require('debug');
var utils = require('./utils');

module.exports = (function() {

	var debugChannel = dbg('mikronode:channel');
	var debugChannelData = dbg('mikronode:channel:data');

	var _ = require('private-parts').createKey();

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
	 * @property {mikronode.Trap} trap - The trap object
	 */

	/**
	 * Channel (should not be instantiated directly)
	 * @exports mikronode.Channel
	 * @implements {EventEmitter}
	 * @class
	 * @param {number} id
	 * @param {mikronode.Connection} conn
	 * @fires mikronode.Channel#event:done
	 * @fires mikronode.Channel#event:trap
	 * @fires mikronode.Channel#event:error
	 * @fires mikronode.Channel#event:timeout
	 * @fires {mikronode.Channel#event:close}
	 */
	function Channel(id, conn) {
		debugChannel('Opening channel: ' + id);

		/**
		 * Channel ID
		 * @public
		 * @readonly
		 * @instance
		 * @member {number} id
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'id', id, false, _);

		/**
		 * Connection
		 * @private
		 * @readonly
		 * @instance
		 * @member {mikronode.Connection} connection
		 * @memberof mikronode.Channel
		 */
		_(this).connection = conn;

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} running
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'running', false, false, _);
		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} closing
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'closing', false, false, _);
		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {boolean} closed
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'closed', false, false, _);

		/**
		 * Clear event listeners on done
		 * @public
		 * @instance
		 * @member {boolean} clearEvents
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'clearEvents', false, true, _);

		/**
		 * Save each line received in a buffer and pass the entire buffer to the done event.
		 * Otherwise the done event will not get all the lines, only the last line. This is
		 * handy when following trailing output from a listen command, where the data could
		 * be endless.
		 * @public
		 * @instance
		 * @member {boolean} saveBuffer
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'saveBuffer', true, true, _);

		/**
		 * Close channel on done
		 * @public
		 * @instance
		 * @member {boolean} closeOnDone
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'closeOnDone', false, true, _);

		/**
		 * @public
		 * @readonly
		 * @instance
		 * @member {string[]} lastCommand
		 * @memberof mikronode.Channel
		 */
		utils.createProperty(this, 'lastCommand', [], false, _, true);

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

		/* A 'error' event is thrown by Socket
		 * and are non-recoverable so we force close the channel.
		 */
		_(this).errorListener = utils.makeListener(this.errorListener, this);
		conn.once('error', _(this).errorListener);

		/* A 'timeout' event is thrown by Socket
		 * but they are recoverable. If Connection has closed
		 * the Socket, we'll close the channel.  Otherwise, just
		 * notify receivers and let them decide what to do.
		 */
		_(this).timeoutListener = utils.makeListener(this.timeoutListener, this);
		conn.on('timeout', _(this).timeoutListener);
	}
	util.inherits(Channel, events.EventEmitter);

	Channel.prototype.errorListener = function errorListener(err) {
		debugChannel('Channel %s caught Connection Error: %o', _(this).id, _(this).connection);
		this.emit('error', err, this);
		this.close(true);
	};

	Channel.prototype.timeoutListener = function timeoutListener(message, socketStillOpen) {
		debugChannel('Channel %s caught Timeout', _(this).id);
		this.emit('timeout', message, socketStillOpen, this);
		if (!socketStillOpen) {
			this.close(true);
		}
	};

	/**
	 * Writes data to the channel
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
	 * @param {mikronode.Channel.writeCallback} [writeCallback] - This will be called just
	 *           before write actually writes the data to the connection.
	 */
	Channel.prototype.write = function write(d, parameters, writeCallback) {
		if (_(this).closing) {
			return;
		}

		_(this).connection.getTraps()[_(this).id] = undefined;

		if (d) {
			if (typeof (d) === 'string') {
				d = d.split("\n");
			}
			if (typeof parameters !== 'function') {
				if (Array.isArray(parameters)) {
					Array.prototype.push.apply(d, parameters);
				} else if (parameters instanceof Object) {
					Object.keys(parameters).forEach(function(k) {
						d.push(k + '=' + parameters[k]);
					});
				}
			} else if (writeCallback === undefined) {
				writeCallback = parameters;
			}
			if (Array.isArray(d) && d.length) {
				_(this).buffer = _(this).buffer.concat(d);
			} else {
				return;
			}
		} else {
			debugChannel('Channel %s write: empty arg.', _(this).id);
		}

		if (_(this).running) {
			_(this).lastCommand = _(this).buffer;
			if (debugChannelData.enabled) {
				debugChannelData('Channel %s running: pushing command %o', _(this).id, _(this).lastCommand);
			} else {
				debugChannel('Channel %s running: pushing command', _(this).id);
			}
			_(this).commands.push([ _(this).buffer, writeCallback ]);
			_(this).buffer = [];
		} else {
			_(this).lastCommand = _(this).buffer;
			var b = _(this).buffer;
			_(this).running = true;
			_(this).saveBuffer = true;
			_(this).buffer = [];
			b.push('.tag=' + _(this).id);
			if (writeCallback) {
				writeCallback(this);
			}
			if (debugChannelData.enabled) {
				debugChannelData('Channel %s idle: writing %o', _(this).id, _(this).lastCommand);
			} else {
				debugChannel('Channel %s idle: writing', _(this).id);
			}
			_(this).connection._write(b); // Send command.
		}
	};

	/**
	 * Called when connection gets 'done'
	 * @private
	 * @param {(string|string[])} data
	 */
	Channel.prototype._done = function _done(data, trap) {
		if (trap) {
			debugChannel('Channel %s trap: %o', _(this).id, trap);
			this.emit('trap', trap, this);
		} else {
			var p = _(this).packet;
			_(this).packet = [];
			if (!p.length) {
				p = [ data ];
			} else if (p[p.length - 1] !== data) {
				p.push(data);
			}

			if (debugChannelData.enabled) {
				debugChannelData('Channel %s done: %o', _(this).id, p);
			} else {
				debugChannel('Channel %s done', _(this).id);
			}

			this.emit('done', p, this);
		}

		if (_(this).clearEvents) {
			this.removeAllListeners('done');
			this.removeAllListeners('data');
			this.removeAllListeners('read');
		}
		_(this).running = false;
		if (_(this).commands.length) {
			var c = _(this).commands.shift();
			var cl = _(this).closing;
			_(this).closing = false;
			debugChannel('Channel %s more commands', _(this).id);
			this.write(c[0], {}, c[1]);
			_(this).closing = cl;
		} else if (_(this).closing || _(this).closeOnDone) {
			this.close();
		}
	};

	/**
	 * Called when connection gets 'data'
	 * @private
	 * @param {(string|string[])} data
	 */
	Channel.prototype._data = function _data(data) {
		if (debugChannelData.enabled) {
			debugChannelData('Channel %s data: %o', _(this).id, data);
		} else {
			debugChannel('Channel %s data', _(this).id);
		}

		if (_(this).saveBuffer) {
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
	 */
	Channel.prototype.close = function close(force) { // Close _(this) channel.
		_(this).closing = true;
		if (_(this).closed || (!force && (_(this).commands.length || _(this).running))) {
			debugChannel('Channel %s closing deferred', _(this).id);
			return;
		}
		debugChannel('Channel %s closing.  Forced: %s', _(this).id, force ? 'true' : 'false');
		if (_(this).running) {
			try {
				debugChannel('Channel %s sending cancel', _(this).id);
				_(this).connection._write([ '/cancel', '=tag=' + _(this).id ]);
			} catch (err) {
				debugChannel('Error sending /cancel', err.stack);
			}
		}

		_(this).connection.removeListener('error', _(this).errorListener);
		_(this).connection.removeListener('timeout', _(this).timeoutListener);

		debugChannel('Channel %s closed', _(this).id);
		_(this).closed = true;
		this.emit('close', this);
		this.removeAllListeners();
	};

	/**
	 * Calls {@link mikronode.Channel#close}(false)
	 * @public
	 */
	Channel.prototype.finalize = function finalize() {
		debugChannel('Channel %s finalize', _(this).id);
		if (!_(this).closing) {
			this.close();
		}
	};

	return Channel;
})();
