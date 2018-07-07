import net = require('net')
import { EventEmitter } from 'events'
import { Socket as TcpSocket } from './tcpsocket'

var ST_STARTED = 1;
var ST_CLOSED = 2;

/**
 * websocket protocol processor
 */
export class Processor extends EventEmitter {
	closeMethod: string
	state: number

	constructor(closeMethod: string) {
		super()
		this.closeMethod = closeMethod;
		this.state = ST_STARTED;
	}

	add(socket: net.Socket, data: Buffer) {
		if (this.state !== ST_STARTED) {
			return;
		}
		var tcpsocket = new TcpSocket(socket, {
			closeMethod: this.closeMethod
		});
		this.emit('connection', tcpsocket);
		socket.emit('data', data);
	}

	close() {
		if (this.state !== ST_STARTED) {
			return;
		}
		this.state = ST_CLOSED;
	}

}
