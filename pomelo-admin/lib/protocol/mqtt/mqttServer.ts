import net = require('net')
import { EventEmitter } from 'events'
import MqttCon = require('mqtt-connection')

let logger = require('pomelo-logger').getLogger('pomelo-admin', 'MqttServer')

let curId = 1;

export class MqttServer extends EventEmitter {
	inited = false
	closed = true
	server: net.Server = null
	socket

	constructor() {
		super()
	}

	listen(port: number) {
		//check status
		if (this.inited) {
			return;
		}

		this.inited = true;

		var self = this;

		this.server = new net.Server();
		this.server.listen(port);

		logger.info('[MqttServer] listen on %d', port);

		this.server.on('listening', this.emit.bind(this, 'listening'));

		this.server.on('error', function (err) {
			// logger.error('mqtt server is error: %j', err.stack);
			self.emit('error', err);
		});

		this.server.on('connection', function (stream) {
			var socket = MqttCon(stream);
			socket['id'] = curId++;

			socket.on('connect', function (pkg) {
				socket.connack({
					returnCode: 0
				});
			});

			socket.on('publish', function (pkg) {
				var topic = pkg.topic;
				var msg = pkg.payload.toString();
				msg = JSON.parse(msg);

				// logger.debug('[MqttServer] publish %s %j', topic, msg);
				socket.emit(topic, msg);
			});

			socket.on('pingreq', function () {
				socket.pingresp();
			});

			socket.send = function (topic, msg) {
				socket.publish({
					topic: topic,
					payload: JSON.stringify(msg)
				});
			};

			self.emit('connection', socket);
		});
	}

	send(topic, msg) {
		this.socket.publish({
			topic: topic,
			payload: msg
		});
	}

	close() {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.server.close();
		this.emit('closed');
	}

}
