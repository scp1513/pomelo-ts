const PKG_HEAD_BYTES = 4;
const MSG_FLAG_BYTES = 1;
const MSG_ROUTE_CODE_BYTES = 2;
//const MSG_ID_MAX_BYTES = 5;
const MSG_ROUTE_LEN_BYTES = 1;

const MSG_ROUTE_CODE_MAX = 0xffff;

const MSG_COMPRESS_ROUTE_MASK = 0x1;
const MSG_COMPRESS_GZIP_MASK = 0x1;
const MSG_COMPRESS_GZIP_ENCODE_MASK = 1 << 4;
const MSG_TYPE_MASK = 0x7;

interface IMsgDecResult {
	id: number,
	type: number,
	compressRoute: number,
	route: string|number,
	body: Buffer,
	compressGzip: number
}

/**
 * pomele client encode
 * id message id;
 * route message route
 * msg message body
 * socketio current support string
 */
export function strencode(str: string): Buffer {
	return new Buffer(str);
}

/**
 * client decode
 * msg String data
 * return Message Object
 */
export function strdecode(buffer: Buffer): string {
	// encoding defaults to 'utf8'
	return buffer.toString();
}

export let Package = {
	TYPE_HANDSHAKE: 1,
	TYPE_HANDSHAKE_ACK: 2,
	TYPE_HEARTBEAT: 3,
	TYPE_DATA: 4,
	TYPE_KICK: 5,

	encode: <(type: number, body?: Buffer) => Buffer>null,
	encodeBatch: <(bodys: Buffer[]) => Buffer>null,
	decode: <(buffer: Buffer) => IPackage[]>null,
}

export let Message = {
	TYPE_REQUEST: 0,
	TYPE_NOTIFY: 1,
	TYPE_RESPONSE: 2,
	TYPE_PUSH: 3,
	
	encode: <(id: number, type: number, compressRoute: number, route: number | string, msg: Buffer, compressGzip?: number) => Buffer>null,
	decode: <(buffer: Buffer) => IMsgDecResult>null,
}

/**
 * Package protocol encode.
 *
 * Pomelo package format:
 * +------+-------------+------------------+
 * | type | body length |       body       |
 * +------+-------------+------------------+
 *
 * Head: 4bytes
 *   0: package type,
 *      1 - handshake,
 *      2 - handshake ack,
 *      3 - heartbeat,
 *      4 - data
 *      5 - kick
 *   1 - 3: big-endian body length
 * Body: body length bytes
 *
 * @param  {Number}    type   package type
 * @param  {ByteArray} body   body content in bytes
 * @return {ByteArray}        new byte array that contains encode result
 */
Package.encode = function (type: number, body?: Buffer): Buffer {
	var length = body ? body.length : 0;
	var buffer: Buffer
	if (type !== Package.TYPE_DATA) {
		buffer = new Buffer(PKG_HEAD_BYTES + length);
	} else {
		length -= PKG_HEAD_BYTES;
		buffer = body;
	}
	var index = 0;
	buffer[index++] = type & 0xff;
	buffer[index++] = (length >> 16) & 0xff;
	buffer[index++] = (length >> 8) & 0xff;
	buffer[index++] = length & 0xff;
	if (body && type !== Package.TYPE_DATA) {
		body.copy(buffer, index, 0, length);
	}
	return buffer;
}

Package.encodeBatch = function (bodys: Buffer[]): Buffer {
	if (bodys.length === 0) {
		return null;
	}
	let length = 0
	for (let i = 0, l = bodys.length; i < l; ++i) {
		length += bodys[i].length
	}
	let buffer = Buffer.alloc(length)
	let index = 0, typeFlag = Package.TYPE_DATA & 0xff
	for (let i = 0, l = bodys.length; i < l; ++i) {
		let body = bodys[i], bodyLen = body.length - PKG_HEAD_BYTES;
		buffer[index++] = typeFlag;
		buffer[index++] = (bodyLen >> 16) & 0xff;
		buffer[index++] = (bodyLen >> 8) & 0xff;
		buffer[index++] = bodyLen & 0xff;
		body.copy(buffer, index, 4, bodyLen);
		index += bodyLen - 4;
	}
	return buffer;
}

/**
 * Package protocol decode.
 * See encode for package format.
 *
 * @param  {ByteArray} buffer byte array containing package content
 * @return {Object}           {type: package type, buffer: body byte array}
 */
Package.decode = function (buffer: Buffer): IPackage[] {
	var offset = 0;
	var length = 0;
	var rs: IPackage[] = [];
	while (offset < buffer.length) {
		var type = buffer[offset++];
		length = ((buffer[offset++]) << 16 | (buffer[offset++]) << 8 | buffer[offset++]) >>> 0;
		var body = length ? new Buffer(length) : null;
		if (body) {
			buffer.copy(body, 0, offset, offset + length);
		}
		offset += length;
		rs.push({ type, body });
	}
	return rs;
}

/**
 * Message protocol encode.
 *
 * @param  id            message id
 * @param  type          message type
 * @param  compressRoute whether compress route
 * @param  route         route code or route string
 * @param  msg           message body bytes
 * @return               encode result
 */
Message.encode = function (id: number, type: number, compressRoute: number, route: number | string, msg: Buffer, compressGzip?: number): Buffer {
	// caculate message max length
	var idBytes = msgHasId(type) ? caculateMsgIdBytes(id) : 0;
	var msgLen = MSG_FLAG_BYTES + idBytes;

	if (msgHasRoute(type)) {
		if (compressRoute) {
			if (typeof route !== 'number') {
				throw new Error('error flag for number route!');
			}
			msgLen += MSG_ROUTE_CODE_BYTES;
		} else {
			msgLen += MSG_ROUTE_LEN_BYTES;
			if (<string>route) {
				let buff = strencode(<string>route);
				if (buff.length > 255) {
					throw new Error('route maxlength is overflow');
				}
				msgLen += buff.length;
			}
		}
	}

	if (msg) {
		msgLen += msg.length;
	}

	var buffer = new Buffer(PKG_HEAD_BYTES + msgLen);
	var offset = PKG_HEAD_BYTES;

	// add flag
	offset = encodeMsgFlag(type, compressRoute, buffer, offset, compressGzip);

	// add message id
	if (msgHasId(type)) {
		offset = encodeMsgId(id, buffer, offset);
	}

	// add route
	if (msgHasRoute(type)) {
		offset = encodeMsgRoute(compressRoute, route, buffer, offset);
	}

	// add body
	if (msg) {
		offset = encodeMsgBody(msg, buffer, offset);
	}

	return buffer;
}

/**
 * Message protocol decode.
 *
 * @param   buffer message bytes
 * @return         message object
 */
Message.decode = function (buffer: Buffer): IMsgDecResult {
	var bytes = buffer;
	var bytesLen = bytes.length || bytes.byteLength;
	var offset = 0;
	var id = 0;
	var route: string|number = null;

	// parse flag
	var flag = bytes[offset++];
	var compressRoute = flag & MSG_COMPRESS_ROUTE_MASK;
	var type = (flag >> 1) & MSG_TYPE_MASK;
	var compressGzip = (flag >> 4) & MSG_COMPRESS_GZIP_MASK;

	// parse id
	if (msgHasId(type)) {
		var m = 0;
		var i = 0;
		do {
			//m = parseInt(bytes[offset]);
			m = bytes[offset];
			id += (m & 0x7f) << (7 * i);
			++offset;
			++i;
		} while (m >= 128);
	}

	// parse route
	if (msgHasRoute(type)) {
		if (compressRoute) {
			route = (bytes[offset++]) << 8 | bytes[offset++];
		} else {
			var routeLen = bytes[offset++];
			route = bytes.toString('binary', offset, offset + routeLen);
			offset += routeLen;
		}
	}

	// parse body
	var bodyLen = bytesLen - offset;
	var body = new Buffer(bodyLen);

	bytes.copy(body, 0, offset, offset + bodyLen);

	return {
		id, type, compressRoute,
		route, body, compressGzip
	}
}

function msgHasId(type: number) {
	return type === Message.TYPE_REQUEST || type === Message.TYPE_RESPONSE;
}

function msgHasRoute(type: number) {
	return type === Message.TYPE_REQUEST || type === Message.TYPE_NOTIFY ||
		type === Message.TYPE_PUSH;
}

function caculateMsgIdBytes(id: number) {
	var len = 0;
	do {
		len += 1;
		id >>= 7;
	} while (id > 0);
	return len;
}

function encodeMsgFlag(type: number, compressRoute: number, buffer: Buffer, offset: number, compressGzip: number) {
	if (type !== Message.TYPE_REQUEST && type !== Message.TYPE_NOTIFY &&
		type !== Message.TYPE_RESPONSE && type !== Message.TYPE_PUSH) {
		throw new Error('unkonw message type: ' + type);
	}

	buffer[offset] = (type << 1) | (compressRoute ? 1 : 0);

	if (compressGzip) {
		buffer[offset] = buffer[offset] | MSG_COMPRESS_GZIP_ENCODE_MASK;
	}

	return offset + MSG_FLAG_BYTES;
}

function encodeMsgId(id: number, buffer: Buffer, offset: number) {
	do {
		var tmp = id % 128;
		var next = Math.floor(id / 128);

		if (next !== 0) {
			tmp = tmp + 128;
		}
		buffer[offset++] = tmp;

		id = next;
	} while (id !== 0);

	return offset;
}

function encodeMsgRoute(compressRoute: number, route: string|number, buffer: Buffer, offset: number) {
	if (compressRoute) {
		if (route > MSG_ROUTE_CODE_MAX) {
			throw new Error('route number is overflow');
		}

		buffer[offset++] = ((<number>route) >> 8) & 0xff;
		buffer[offset++] = (<number>route) & 0xff;
	} else {
		if (route) {
			buffer[offset++] = (<string>route).length & 0xff;
			buffer.write(<string>route, offset, (<string>route).length, 'binary');
			offset += (<string>route).length;
		} else {
			buffer[offset++] = 0;
		}
	}

	return offset;
}

function encodeMsgBody(msg: Buffer, buffer: Buffer, offset: number) {
	msg.copy(buffer, offset, 0, msg.length);
	return offset + msg.length;
}
