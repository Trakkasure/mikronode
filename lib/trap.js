module.exports = (function() {

	/**
	 * 
	 * @exports mikronode.TrapError
	 * @class
	 */
	function TrapError() {
		/**
		 * @property {string} [category=''] - The category of the trap. Some traps don't
		 *           populate the category.
		 */
		this.category = '';
		/**
		 * @property {string} message- The message
		 */
		this.message = '';
		this.toString = function() {
			return this.message + '(' + this.category + ')';
		};
	}

	/**
	 * Wrapper for traps sent from device
	 * 
	 * @exports mikronode.Trap
	 * @class
	 * @param {string} [message]
	 */
	function Trap() {
		/**
		 * @property {mikronode.TrapError[]} errors - Since multiple traps can be recieved
		 *           from a single command, this array captures them all.
		 */
		this.errors = [ new TrapError() ];
		/**
		 * @property {string} [channelId] - The id of the channel originating the trap
		 */
		this.channelId = '';
		/**
		 * @property {mikronode.Channel} [channel] - The channel originating the trap
		 */
		this.channel = null;

		this.toString = function() {
			return this.errors[0].toString();
		};
	}

	Trap.prototype.addTrapError = function() {
		this.errors.push(new TrapError());
	};

	return Trap;

})();
