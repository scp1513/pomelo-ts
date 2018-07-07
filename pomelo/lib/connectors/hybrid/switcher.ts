import net = require('net')
import tls = require('tls')
import ws = require('ws')
import { EventEmitter } from 'events'
import { Processor as WSProcessor } from './wsprocessor'
import { Processor as TCPProcessor } from './tcpprocessor'
import { Socket as TcpSocket } from './tcpsocket'

let logger = require('pomelo-logger').getLogger('pomelo', __filename);

let HTTP_METHODS = ['GET', 'POST', 'DELETE', 'PUT', 'HEAD']

let ST_STARTED = 1;
let ST_CLOSED = 2;

let DEFAULT_TIMEOUT = 90;

export interface ISwitcherOpts {
	closeMethod?: string
	timeout?: number
	setNoDelay?: boolean
	ssl?: tls.TlsOptions
}

/**
 * Switcher for tcp and websocket protocol
 *
 * @param {Object} server tcp server instance from node.js net module
 */
export class Switcher extends EventEmitter {
	server: net.Server
	wsprocessor = new WSProcessor()
	tcpprocessor: TCPProcessor
	id = 1
	timeout: number
	setNoDelay: boolean
	state: number

	constructor(server: net.Server | tls.Server, opts: ISwitcherOpts) {
		super()
		this.server = server
		this.tcpprocessor = new TCPProcessor(opts.closeMethod)
		this.timeout = (opts.timeout || DEFAULT_TIMEOUT) * 1000
		this.setNoDelay = !!opts.setNoDelay

		if (!opts.ssl) {
			this.server.on('connection', (socket) => { this.newSocket(socket) })
		} else {
			let tlsServer = <tls.Server>server;
			tlsServer.on('secureConnection', (socket) => { this.newSocket(socket) })
			tlsServer.on('clientError', (err: AnyErr, socket: tls.TLSSocket) => {
				logger.warn('an ssl error occured before handshake established: ', err)
				socket.destroy()
			}).on('tlsClientError', (err, socket) => {
				logger.warn('an ssl error occured before handshake established: ', err)
				socket.destroy()
			})
		}

		this.wsprocessor.on('connection', (socket: ws) => { this.emit('connection', socket) });
		this.tcpprocessor.on('connection', (socket: TcpSocket) => { this.emit('connection', socket) });

		this.state = ST_STARTED;
	}

	newSocket(socket: net.Socket) {
		if (this.state !== ST_STARTED) {
			return;
		}

		socket.setTimeout(this.timeout, () => {
			logger.warn('connection is timeout without communication, the remote ip is %s && port is %s',
				socket.remoteAddress, socket.remotePort);
			socket.destroy();
		});

		socket.once('data', (data) => {
			// FIXME: handle incomplete HTTP method
			if (this.isHttp(data)) {
				this.processHttp(this.wsprocessor, socket, data);
			} else {
				if (this.setNoDelay) {
					socket.setNoDelay(true);
				}
				this.processTcp(this.tcpprocessor, socket, data);
			}
		});
	}

	close() {
		if (this.state !== ST_STARTED) {
			return;
		}

		this.state = ST_CLOSED;
		this.wsprocessor.close();
		this.tcpprocessor.close();
	}

	private isHttp(data: Buffer) {
		let head = data.toString('binary', 0, 4);

		// TODO: 优化
		for (let i = 0, l = HTTP_METHODS.length; i < l; i++) {
			if (head.indexOf(HTTP_METHODS[i]) === 0) {
				return true;
			}
		}

		return false;
	}

	private processHttp(processor: WSProcessor, socket: net.Socket, data: Buffer) {
		processor.add(socket, data);
	}

	private processTcp(processor: TCPProcessor, socket: net.Socket, data: Buffer) {
		processor.add(socket, data);
	}

}
