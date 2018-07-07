import encoder = require('./encoder')
import decoder = require('./decoder')
import parser = require('./parser')

/**
 * [encode the given message, return a Buffer represent the message encoded by protobuf]
 * @param  key The key to identify the message type.
 * @param  msg The message body, a js object.
 * @return The binary encode result in a Buffer.
 */
export function encode(key: string, msg: AnyMap) {
	return encoder.encode(key, msg);
}

export function encode2Bytes(key: string, msg: AnyMap) {
	var buffer = encode(key, msg);
	if (!buffer || !buffer.length) {
		console.warn('encode msg failed! key : %j, msg : %j', key, msg);
		return null;
	}
	var bytes = new Uint8Array(buffer.length);
	for (var offset = 0; offset < buffer.length; offset++) {
		bytes[offset] = buffer.readUInt8(offset);
	}

	return bytes;
}

export function encodeStr(key: string, msg: AnyMap, code: string) {
	code = code || 'base64';
	var buffer = encode(key, msg);
	return !!buffer ? buffer.toString(code) : buffer;
}

export function decode(key: string, buf: Buffer) {
	return decoder.decode(key, buf);
}

export function decodeStr(key: string, str: string, code: string) {
	code = code || 'base64';
	var buffer = new Buffer(str, code);

	return !!buffer ? decode(key, buffer) : buffer;
}

export function parse(json: { [proto: string]: IProto }) {
	return parser.parse(json);
}

export function setEncoderProtos(protos: { [proto: string]: IProtoParsed }) {
	encoder.init(protos);
}

export function setDecoderProtos(protos: { [proto: string]: IProtoParsed }) {
	decoder.init(protos);
}

interface IInitOpts {
	encoderProtos: {[proto: string]: IProtoParsed}
	decoderProtos: {[proto: string]: IProtoParsed}
}

export function init(opts: IInitOpts) {
	//On the serverside, use serverProtos to encode messages send to client
	encoder.init(opts.encoderProtos);

	//On the serverside, user clientProtos to decode messages receive from clients
	decoder.init(opts.decoderProtos);
}
