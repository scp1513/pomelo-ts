import net = require('net')
import tls = require('tls')
import ws = require('ws')
import { Socket as TcpSocket } from './hybrid/tcpsocket'
import { Component as Dictionary } from '../components/dictionary'
import { Component as Protobuf } from '../components/protobuf'
import { Socket as HybridSocket } from './hybridsocket'
import { Switcher, ISwitcherOpts } from './hybrid/switcher'
import { Command as Handshake } from './commands/handshake'
import { Command as Heartbeat } from './commands/heartbeat'
import Kick = require('./commands/kick')
import { Coder } from './common/coder'
import pomelo = require('../pomelo')

interface IHybridConnectorOpts extends ISwitcherOpts {
	distinctHost?: boolean
	useDict?: boolean
	useProtobuf?: boolean
}

/**
 * Connector that manager low level connection and protocol bewteen server and client.
 * Develper can provide their own connector to switch the low level prototol, such as tcp or probuf.
 */
export class Connector extends Coder implements IConnector {
	opts: IHybridConnectorOpts
	port: number
	host: string
	useProtobuf: boolean
	handshake: Handshake
	heartbeat: Heartbeat
	distinctHost: boolean
	ssl: tls.TlsOptions
	switcher: Switcher

	listeningServer: net.Server | tls.Server
	curId = 1

	constructor(port: number, host: string, opts: IHybridConnectorOpts) {
		super();

		this.opts = opts || {};
		this.port = port;
		this.host = host;
		this.useDict = opts.useDict;
		this.useProtobuf = opts.useProtobuf;
		this.handshake = new Handshake(opts);
		this.heartbeat = new Heartbeat(opts);
		this.distinctHost = !!opts.distinctHost;
		this.ssl = opts.ssl;

		this.switcher = null;
	}

	/**
	 * Start connector to listen the specified port
	 */
	start(cb: Callback<void>) {
		var app = pomelo.app;

		var gensocket = (socket: ws | TcpSocket) => {
			var hybridsocket = new HybridSocket(this.curId++, socket);
			hybridsocket.on('handshake', (msg: IHandshakeCli) => { this.handshake.handle(hybridsocket, msg) })
			hybridsocket.on('heartbeat', () => { this.heartbeat.handle(hybridsocket) })
			hybridsocket.on('disconnect', () => { this.heartbeat.clear(hybridsocket.id) })
			hybridsocket.on('closing', (reason: string) => { Kick.handle(hybridsocket, reason) })
			this.emit('connection', hybridsocket);
		};

		this.dictionary = app.components.__dictionary__ as Dictionary;
		this.protobuf = app.components.__protobuf__ as Protobuf;

		if (!this.ssl) {
			this.listeningServer = net.createServer();
		} else {
			this.listeningServer = tls.createServer(this.ssl);
		}
		this.switcher = new Switcher(this.listeningServer, this.opts);

		this.switcher.on('connection', function (socket: ws | TcpSocket) {
			gensocket(socket);
		});

		if (this.distinctHost) {
			this.listeningServer.listen(this.port, this.host);
		} else {
			this.listeningServer.listen(this.port);
		}

		process.nextTick(cb);
	}

	stop(force: boolean, cb: Callback<void>) {
		this.switcher.close();
		this.listeningServer.close();

		process.nextTick(cb);
	}
}
