/**
 * http://usejsdoc.org/
 */
/**
 * Encodes a string
 * @private
 * @function
 * @param {string} s The string to encode
 * @returns {Buffer} Encoded string
 */
exports.encodeString = function encodeString(s) {
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
};

/**
 * Decodes the length of the data array
 * @function
 * @private
 * @param {array} data - The data to dump
 * @returns {array} length
 */
exports.decodeLength = function decodeLength(data) { // Ported from the PHP API on the
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
};

/**
 * Dumps an array to 'debug' in hex format
 * @function
 * @private
 * @param {array} data - The data to dump
 */
exports.hexDump = function hexDump(data, debugSocketData) {
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
			debugSocketData("%d: %s    %s", j - 7, hex.join(' '), cref.join(''));
			hex = [];
			cref = [];
		}
	}
	if (i !== 8) {
		debugSocketData(hex.join(' ') + '    ' + cref.join(''));
		hex = [];
		cref = [];
	}
};

/**
 * Creates a private property and a getter[,setter]
 * @function
 * @private
 * @param {object} object - The object in which the property should be created
 * @param {string} name - The name of the property
 * @param {*} initialValue - The property's initial value
 * @param {boolean} [allowSet=false] - If true, the property can be set externally.
 * @param {object} [privateStore] - If set, a private property in the form of
 *           _(object)[name] will be created in the specified store. This can be set only
 *           with a reference to 'object' AND '_' even if setting by this[name] isn't
 *           allowed.
 */
exports.createProperty = function createProperty(object, name, initialValue, allowSet, privateStore) {
	var props = {
		enumerable : true
	};
	if (privateStore) {
		privateStore(object)[name] = initialValue;
		props.get = function() {
			return privateStore(object)[name];
		};
		if (allowSet) {
			props.set = function(val) {
				privateStore(object)[name] = val;
			};
		}
	} else {
		if (allowSet) {
			props.writable = true;
		}
		props.value = initialValue;
	}
	Object.defineProperty(object, name, props);
};
