import { EventEmitter } from 'events'
import ws = require('ws')
import {handler} from './common/handler'
import { Socket as TcpSocket } from './hybrid/tcpsocket'
import {Package} from '../../../pomelo-protocol'
var logger = require('pomelo-logger').getLogger('pomelo', __filename)

var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;

/**
 * Socket class that wraps socket and websocket to provide unified interface for up level.
 */
export class Socket extends EventEmitter implements IPomeloSocket {
	id: number
	state: number
	socket: ws | TcpSocket
	remoteAddress: IRemoteAddress

	constructor(id: number, socket: ws | TcpSocket) {
		super()
		this.id = id
		this.socket = socket

		let tcpSocket = socket as TcpSocket
		let _socket = tcpSocket._socket
		this.remoteAddress = {
			ip: _socket.remoteAddress,
			port: _socket.remotePort
		};

		tcpSocket.once('close', this.emit.bind(this, 'disconnect'))
		tcpSocket.on('error', this.emit.bind(this, 'error'))

		tcpSocket.on('message', (msg: Buffer) => {
			if (msg) {
				let pkg = Package.decode(msg)
				handler(this, pkg)
			}
		})

		this.state = ST_INITED

		// TODO: any other events?
	}

	/**
	 * Send raw byte data.
	 */
	sendRaw(msg: Buffer) {
		if (!msg || this.state !== ST_WORKING) {
			return;
		}
		let socket = <ws>this.socket; // TODO:
		socket.send(msg, { binary: true }, function (err) {
			if (!!err) {
				logger.error('websocket send binary data failed: %j', err.stack);
				return;
			}
		});
	}

	/**
	 * Send byte data package to client.
	 * @param  msg byte data
	 */
	send(msg: string|Buffer) {
		if (typeof msg === 'string') {
			msg = new Buffer(msg);
		} else if (!(msg instanceof Buffer)) {
			msg = new Buffer(JSON.stringify(msg));
		}
		this.sendRaw(Package.encode(Package.TYPE_DATA, msg));
	}

	/**
	 * Send byte data packages to client in batch.
	 * @param  msgs byte data
	 */
	sendBatch(msgs: Buffer[]) {
		this.sendRaw(Package.encodeBatch(msgs));
	}

	/**
	 * Send message to client no matter whether handshake.
	 */
	sendForce(msg: string|Buffer) {
		if (!msg || this.state === ST_CLOSED) {
			return;
		}
		this.socket.send(msg, { binary: true });
	}

	/**
	 * Response handshake request
	 *
	 * @api private
	 */
	handshakeResponse(resp: string|Buffer) {
		if (this.state !== ST_INITED) {
			return;
		}

		this.socket.send(resp, { binary: true });
		this.state = ST_WAIT_ACK;
	}

	/**
	 * Close the connection.
	 *
	 * @api private
	 */
	disconnect() {
		if (this.state === ST_CLOSED) {
			return;
		}

		this.state = ST_CLOSED;
		this.socket.emit('close');
		this.socket.close();
	}

}
