import codec = require('./codec')
import constant = require('./constant')
import util = require('./util')

export let protos: {[proto: string]: IProtoParsed} = {}

export function init(_protos: {[proto: string]: IProtoParsed}) {
	protos = _protos || {};
}

export function encode(route: string, msg: AnyMap) {
	if (!route || !msg) {
		console.warn('Route or msg can not be null! route : %j, msg %j', route, msg);
		return null;
	}

	//Get protos from protos map use the route as key
	var proto = protos[route];

	//Check msg
	if (!checkMsg(msg, proto)) {
		console.warn('check msg failed! msg : %j, proto : %j', msg, proto);
		return null;
	}

	//Set the length of the buffer 2 times bigger to prevent overflow
	var length = Buffer.byteLength(JSON.stringify(msg)) * 2;

	//Init buffer and offset
	var buffer = new Buffer(length);
	var offset = 0;

	if (!!proto) {
		offset = encodeMsg(buffer, offset, proto, msg);
		if (offset > 0) {
			return buffer.slice(0, offset);
		}
	}

	return null;
}

/**
 * Check if the msg follow the defination in the protos
 */
function checkMsg(msg: AnyMap, parsed: IProtoParsed) {
	if (!parsed || !msg) {
		console.warn('no protos or msg exist! msg : %j, protos : %j', msg, parsed);
		return false;
	}

	for (var name in parsed) {
		var proto = parsed[name];

		//All required element must exist
		switch (proto.option) {
			case 'required':
			case 'optional':
				if (proto.option === 'required' && typeof (msg[name]) === 'undefined') {
					console.warn('no property exist for required! name: %j, proto: %j, msg: %j', name, proto, msg);
					return false;
				}
				if (typeof (msg[name]) !== 'undefined') {
					var message = parsed.__messages[proto.type] || protos['message ' + proto.type];
					if (!!message && !checkMsg(msg[name], message)) {
						console.warn('inner proto error! name: %j, proto: %j, msg: %j', name, proto, msg);
						return false;
					}
				}
				break;
			case 'repeated':
				//Check nest message in repeated elements
				var message = parsed.__messages[proto.type] || protos['message ' + proto.type];
				if (!!msg[name] && !!message) {
					for (var i = 0; i < msg[name].length; i++) {
						if (!checkMsg(msg[name][i], message)) {
							return false;
						}
					}
				}
				break;
		}
	}

	return true;
}

function encodeMsg(buffer: Buffer, offset: number, protos: IProtoParsed, msg: AnyMap) {
	for (var name in msg) {
		if (!!protos[name]) {
			var proto = protos[name];
			switch (proto.option) {
				case 'required':
				case 'optional':
					offset = writeBytes(buffer, offset, encodeTag(proto.type, proto.tag));
					offset = encodeProp(msg[name], proto.type, offset, buffer, protos);
					break;
				case 'repeated':
					if (!!msg[name] && msg[name].length > 0) {
						offset = encodeArray(msg[name], proto, offset, buffer, protos);
					}
					break;
			}
		}
	}

	return offset;
}

function encodeProp(value: any, type: string, offset: number, buffer: Buffer, parsed?: IProtoParsed) {
	var length = 0;

	switch (type) {
		case 'uint32':
		case 'uInt32':
			offset = writeBytes(buffer, offset, codec.encodeUInt32(value));
			break;
		case 'int32':
		case 'sint32':
		case 'sInt32':
			offset = writeBytes(buffer, offset, codec.encodeSInt32(value));
			break;
		case 'float':
			buffer.writeFloatLE(value, offset);
			offset += 4;
			break;
		case 'double':
			buffer.writeDoubleLE(value, offset);
			offset += 8;
			break;
		case 'string':
			length = Buffer.byteLength(value);

			//Encode length
			offset = writeBytes(buffer, offset, codec.encodeUInt32(length));
			//write string
			buffer.write(value, offset, length);
			offset += length;
			break;
		case 'bool':
			buffer[offset] = value ? 1 : 0;
			++offset;
			break;
		default:
			var message = parsed.__messages[type] || protos['message ' + type];
			if (!!message) {
				//Use a tmp buffer to build an internal msg
				var tmpBuffer = new Buffer(Buffer.byteLength(JSON.stringify(value)) * 2);
				length = 0;

				length = encodeMsg(tmpBuffer, length, message, value);
				//Encode length
				offset = writeBytes(buffer, offset, codec.encodeUInt32(length));
				//contact the object
				tmpBuffer.copy(buffer, offset, 0, length);

				offset += length;
			}
			break;
	}

	return offset;
}

/**
 * Encode reapeated properties, simple msg and object are decode differented
 */
function encodeArray(array: any[], proto: IProtoField, offset: number, buffer: Buffer, protos: IProtoParsed) {
	var i = 0;
	if (util.isSimpleType(proto.type)) {
		offset = writeBytes(buffer, offset, encodeTag(proto.type, proto.tag));
		offset = writeBytes(buffer, offset, codec.encodeUInt32(array.length));
		for (i = 0; i < array.length; i++) {
			offset = encodeProp(array[i], proto.type, offset, buffer);
		}
	} else {
		for (i = 0; i < array.length; i++) {
			offset = writeBytes(buffer, offset, encodeTag(proto.type, proto.tag));
			offset = encodeProp(array[i], proto.type, offset, buffer, protos);
		}
	}

	return offset;
}

function writeBytes(buffer: Buffer, offset: number, bytes: number[]) {
	for (var i = 0; i < bytes.length; i++) {
		buffer.writeUInt8(bytes[i], offset);
		offset++;
	}

	return offset;
}

function encodeTag(type: ProtoType, tag: number): number[] {
	var value = constant.TYPES[type];

	if (value !== 0 && !value) value = 2;
	return codec.encodeUInt32((tag << 3) | value);
}
