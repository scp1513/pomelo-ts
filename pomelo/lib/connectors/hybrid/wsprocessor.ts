import { EventEmitter } from 'events'
import net = require('net')
import http = require('http')
import ws = require('ws')

var ST_STARTED = 1;
var ST_CLOSED = 2;

/**
 * websocket protocol processor
 */
export class Processor extends EventEmitter {
	httpServer: http.Server
	wsServer: ws.Server
	state: number

	constructor() {
		super()
		this.httpServer = new http.Server();

		this.wsServer = new ws.Server({ server: this.httpServer });

		this.wsServer.on('connection', (socket) => {
			// emit socket to outside
			this.emit('connection', socket);
		});

		this.state = ST_STARTED;
	}

	add(socket: net.Socket, data: Buffer) {
		if (this.state !== ST_STARTED) {
			return;
		}
		this.httpServer.emit('connection', socket);
		// compatible with old stream
		socket.emit('data', data);
	}

	close() {
		if (this.state !== ST_STARTED) {
			return;
		}
		this.state = ST_CLOSED;
		this.wsServer.close();
		this.wsServer = null;
		this.httpServer = null;
	}

}
