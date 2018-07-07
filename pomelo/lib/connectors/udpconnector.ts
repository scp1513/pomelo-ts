import net = require('net');
import dgram = require("dgram");
import Constants = require('../util/constants');
import {Socket as UdpSocket} from './udpsocket';
import Kick = require('./commands/kick');
import { Command as Handshake } from './commands/handshake';
import { Command as Heartbeat } from './commands/heartbeat';
import { Coder } from './common/coder';

let logger = require('pomelo-logger').getLogger('pomelo', __filename);

export interface IUdpConnectorOpts {
	udpType: dgram.SocketType
	heartbeat?: number
	timeout?: number
	disconnectOnTimeout?: boolean
}

export class Connector extends Coder implements IConnector {
	type: dgram.SocketType
	handshake: Handshake
	heartbeat: Heartbeat
	clients: {[key: string]: UdpSocket}
	host: string
	port: number
	tcpServer: net.Server
	socket: dgram.Socket
	curId = 1

	constructor(port: number, host: string, opts: IUdpConnectorOpts) {
		super()

		this.type = opts.udpType || 'udp4';
		this.handshake = new Handshake(opts);
		if (!opts.heartbeat) {
			opts.heartbeat = Constants.TIME.DEFAULT_UDP_HEARTBEAT_TIME;
			opts.timeout = Constants.TIME.DEFAULT_UDP_HEARTBEAT_TIMEOUT;
		}
		opts.disconnectOnTimeout = true
		this.heartbeat = new Heartbeat(opts);
		this.clients = {};
		this.host = host;
		this.port = port;
	}

	start(cb: Callback<void>) {
		this.tcpServer = net.createServer();
		this.socket = dgram.createSocket(this.type, (msg, peer) => {
			var key = this.genKey(peer);
			if (!this.clients[key]) {
				var udpsocket = new UdpSocket(this.curId++, this.socket, peer);
				this.clients[key] = udpsocket;

				udpsocket.on('handshake',
					this.handshake.handle.bind(this.handshake, udpsocket));

				udpsocket.on('heartbeat',
					this.heartbeat.handle.bind(this.heartbeat, udpsocket));

				udpsocket.on('disconnect',
					this.heartbeat.clear.bind(this.heartbeat, udpsocket.id));

				udpsocket.on('disconnect', () => {
					delete this.clients[this.genKey(udpsocket.peer)];
				});

				udpsocket.on('closing', Kick.handle.bind(null, udpsocket));

				this.emit('connection', udpsocket);
			}
		});

		this.socket.on('message', (data, peer) => {
			var socket = this.clients[this.genKey(peer)];
			if (!!socket) {
				socket.emit('package', data);
			}
		});

		this.socket.on('error', function (err) {
			logger.error('udp socket encounters with error: %j', err.stack);
			return;
		});

		this.socket.bind(this.port, this.host);
		this.tcpServer.listen(this.port);
		process.nextTick(cb);
	}

	stop(force: boolean, cb: Callback<void>) {
		this.socket.close();
		process.nextTick(cb);
	}

	private genKey(peer: dgram.RemoteInfo) {
		return peer.address + ":" + peer.port;
	}

}
