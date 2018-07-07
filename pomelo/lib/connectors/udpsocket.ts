import { EventEmitter } from 'events'
import dgram = require("dgram");
import {handler} from './common/handler'
import {Package} from '../../../pomelo-protocol'

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;

export class Socket extends EventEmitter implements IPomeloSocket {
	id: number
	socket: dgram.Socket
	peer: dgram.RemoteInfo
	host: string
	port: number
	remoteAddress: IRemoteAddress
	state: number

	constructor(id: number, socket: dgram.Socket, peer: dgram.RemoteInfo) {
		super()

		this.id = id;
		this.socket = socket;
		this.peer = peer;
		this.host = peer.address;
		this.port = peer.port;
		this.remoteAddress = {
			ip: this.host,
			port: this.port
		};

		var self = this;
		this.on('package', function (buff: Buffer) {
			if (!!buff) {
				let pkg = Package.decode(buff);
				handler(self, pkg);
			}
		});

		this.state = ST_INITED;
	}

	/**
	 * Send byte data package to client.
	 *
	 * @param  msg byte data
	 */
	send(msg: string|Buffer) {
		if (this.state !== ST_WORKING) {
			return;
		}
		if (typeof msg === 'string') {
			msg = new Buffer(msg);
		} else if (!(msg instanceof Buffer)) {
			msg = new Buffer(JSON.stringify(msg));
		}
		this.sendRaw(Package.encode(Package.TYPE_DATA, msg));
	}

	sendRaw(msg: Buffer) {
		this.socket.send(msg, 0, msg.length, this.port, this.host, function (err, bytes) {
			if (!!err) {
				logger.error('send msg to remote with err: %j', err.stack);
				return;
			}
		});
	}

	sendForce(msg: Buffer) {
		if (this.state === ST_CLOSED) {
			return;
		}
		this.sendRaw(msg);
	}

	handshakeResponse(resp: Buffer) {
		if (this.state !== ST_INITED) {
			return;
		}
		this.sendRaw(resp);
		this.state = ST_WAIT_ACK;
	}

	sendBatch(msgs: Buffer[]) {
		if (this.state !== ST_WORKING) {
			return;
		}
		var rs = [];
		for (var i = 0; i < msgs.length; i++) {
			var src = Package.encode(Package.TYPE_DATA, msgs[i]);
			rs.push(src);
		}
		this.sendRaw(Buffer.concat(rs));
	}

	disconnect() {
		if (this.state === ST_CLOSED) {
			return;
		}
		this.state = ST_CLOSED;
		this.emit('disconnect', 'the connection is disconnected.');
	}

}
