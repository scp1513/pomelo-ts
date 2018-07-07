import codec = require('./codec');
import util = require('./util');

var Decoder = module.exports;

var buffer: Buffer;
var offset = 0;

let protos: { [proto: string]: IProtoParsed }

export function init(_protos: { [proto: string]: IProtoParsed }) {
	protos = _protos || {};
}

export function setProtos(_protos: { [proto: string]: IProtoParsed }) {
	if (!!_protos) {
		protos = _protos;
	}
}

export function decode(route: string, buf: Buffer) {
	var proto = protos[route];

	buffer = buf;
	offset = 0;

	if (!!proto) {
		return decodeMsg({}, proto, buffer.length);
	}

	return null;
}

function decodeMsg(msg: AnyMap, proto: IProtoParsed, length: number): AnyMap {
	while (offset < length) {
		var head = getHead();
		var tag = head.tag;
		var name = proto.__tags[tag];

		switch (proto[name].option) {
			case 'optional':
			case 'required':
				msg[name] = decodeProp(proto[name].type, proto);
				break;
			case 'repeated':
				if (!msg[name]) {
					msg[name] = [];
				}
				decodeArray(msg[name], proto[name].type, proto);
				break;
		}
	}

	return msg;
}

/**
 * Get property head from protobuf
 */
function getHead() {
	var tag = codec.decodeUInt32(getBytes());

	return {
		type: tag & 0x7,
		tag: tag >> 3
	};
}

function decodeProp(type: string, protos?: IProtoParsed): number | string | boolean | AnyMap {
	switch (type) {
		case 'uint32':
		case 'uInt32':
			return codec.decodeUInt32(getBytes());
		case 'int32':
		case 'sint32':
		case 'sInt32':
			return codec.decodeSInt32(getBytes());
		case 'float':
			var float = buffer.readFloatLE(offset);
			offset += 4;
			return float;
		case 'double':
			var double = buffer.readDoubleLE(offset);
			offset += 8;
			return double;
		case 'string':
			var length = codec.decodeUInt32(getBytes());

			var str = buffer.toString('utf8', offset, offset + length);
			offset += length;

			return str;
		case 'bool':
			var byte = buffer.readUInt8(offset);
			++offset;
			return !!byte;
		default:
			var message = protos && (protos.__messages[type] || Decoder.protos['message ' + type]);
			if (message) {
				var length = codec.decodeUInt32(getBytes());
				var msg: AnyMap = {};
				decodeMsg(msg, message, offset + length);
				return msg;
			}
			return null;
	}
}

function decodeArray(array: (number | string | boolean | AnyMap)[], type: string, proto: IProtoParsed) {
	if (util.isSimpleType(type)) {
		var length = codec.decodeUInt32(getBytes());

		for (var i = 0; i < length; i++) {
			array.push(decodeProp(type));
		}
	} else {
		array.push(decodeProp(type, proto));
	}
}

function getBytes(flag?: boolean) {
	var bytes: number[] = [];
	var pos = offset;
	flag = flag || false;

	var b: number;
	do {
		b = buffer.readUInt8(pos);
		bytes.push(b);
		pos++;
	} while (b >= 128);

	if (!flag) {
		offset = pos;
	}
	return bytes;
}
