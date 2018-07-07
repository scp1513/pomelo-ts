import rsa = require("node-bignumber");
import taskManager = require('../common/manager/taskManager');
import { Application } from "../application";
import pomelo = require('../pomelo');
import events = require('../util/events');
import utils = require('../util/utils');
import { SessionService, Session, FrontendSession } from "../common/service/sessionService";
import { Component as Connection } from './connection';
import { Component as Server } from './server';
import { Component as PushScheduler } from './pushScheduler';

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

/**
 * Connector component. Receive client requests and attach session with socket.
 *
 * @param {Object} app  current application context
 * @param {Object} opts attach parameters
 *                      opts.connector {Object} provides low level network and protocol details implementation between server and clients.
 */
export class Component implements IComponent {
	static _name = '__connector__'
	app: Application
	connector: IConnector
	encode
	decode: (msg: IPackage, session: ISession, cb?: Callback<IMessage>) => (void|IMessage)
	useCrypto: boolean
	useHostFilter: boolean
	useAsyncCoder: boolean
	blacklistFun: (cb: (err: AnyErr, list: string[]) => void) => void
	keys: {[sessionId: number]: any}
	blacklist: string[]
	server: Server
	session: SessionService
	connection: Connection

	constructor(app: Application, opts?: IConnectorOpts) {
		opts = opts || {};
		this.app = app;
		this.connector = this.getConnector(app, opts);
		this.encode = opts.encode;
		this.decode = opts.decode;
		this.useCrypto = opts.useCrypto;
		this.useHostFilter = opts.useHostFilter;
		this.useAsyncCoder = opts.useAsyncCoder;
		this.blacklistFun = opts.blacklistFun;
		this.keys = {};
		this.blacklist = [];

		if (opts.useDict) {
			app.load(pomelo.dictionary, app.get('dictionaryConfig'));
		}

		if (opts.useProtobuf) {
			app.load(pomelo.protobuf, app.get('protobufConfig'));
		}

		// component dependencies
		this.server = null;
		this.session = null;
		this.connection = null;
	}

	start(cb: Callback<void>) {
		this.server = this.app.components.__server__ as Server;
		this.session = this.app.components.__session__ as SessionService;
		this.connection = this.app.components.__connection__ as Connection;

		// check component dependencies
		if (!this.server) {
			process.nextTick(() => {
				cb(new Error('fail to start connector component for no server component loaded'));
			});
			return;
		}

		if (!this.session) {
			process.nextTick(function () {
				cb(new Error('fail to start connector component for no session component loaded'));
			});
			return;
		}

		process.nextTick(cb);
	}

	afterStart(cb: Callback<void>) {
		this.connector.start(cb);
		this.connector.on('connection', (socket: IPomeloSocket) => this.hostFilter(socket, (socket) => {this.bindEvents(socket)}));
	}

	stop(force: boolean, cb: Callback<void>) {
		if (this.connector) {
			this.connector.stop(force, cb);
			this.connector = null;
			return;
		} else {
			process.nextTick(cb);
		}
	}

	send(reqId: number, route: string, msg: AnyMap, recvs: number[], opts, cb: Callback<void>) {
		logger.debug('[%s] send message reqId: %s, route: %s, msg: %j, receivers: %j, opts: %j', this.app.serverId, reqId, route, msg, recvs, opts);
		if (this.useAsyncCoder) {
			return this.sendAsync(reqId, route, msg, recvs, opts, cb);
		}

		var emsg: Buffer = <any>msg;
		if (this.encode) {
			// use costumized encode
			emsg = this.encode.call(this, reqId, route, msg);
		} else if (this.connector.encode) {
			// use connector default encode
			emsg = this.connector.encode(reqId, route, msg);
		}

		this.doSend(reqId, route, emsg, recvs, opts, cb);
	}

	sendAsync(reqId: number, route: string, msg, recvs: number[], opts, cb: Callback<void>) {
		var emsg = msg;

		if (this.encode) {
			// use costumized encode
			this.encode(reqId, route, msg, (err, encodeMsg) => {
				if (err) {
					return cb(err);
				}

				emsg = encodeMsg;
				this.doSend(reqId, route, emsg, recvs, opts, cb);
			});
		} else if (this.connector.encode) {
			// use connector default encode
			this.connector.encode(reqId, route, msg, (err, encodeMsg) => {
				if (err) {
					return cb(err);
				}

				emsg = encodeMsg;
				this.doSend(reqId, route, emsg, recvs, opts, cb);
			});
		}
	}

	doSend(reqId: number, route: string, buf: Buffer, recvs: number[], opts, cb: Callback<void>) {
		if (!buf) {
			process.nextTick(function () {
				return cb && cb(new Error('fail to send message for encode result is empty.'));
			});
		}

		let pushScheduler = this.app.components.__pushScheduler__ as PushScheduler
		pushScheduler.schedule(reqId, route, buf, recvs, opts, cb);
	}

	setPubKey(id: number, key) {
		var pubKey = new rsa.Key();
		pubKey.n = new rsa.BigInteger(key.rsa_n, 16);
		pubKey.e = key.rsa_e;
		this.keys[id] = pubKey;
	}

	getPubKey(id: number) {
		return this.keys[id];
	}

	private getConnector(app: Application, opts: IConnectorOpts): IConnector {
		var connector = opts.connector;
		if (!connector) {
			return this.getDefaultConnector(app, opts);
		}

		if (typeof connector !== 'function') {
			return connector;
		}

		var curServer = app.getCurServer();
		return new connector(curServer.clientPort, curServer.host, opts);
	}

	private getDefaultConnector(app: Application, opts: IConnectorOpts) {
		var DefaultConnector = require('../connectors/hybridconnector').Connector;
		var curServer = app.getCurServer();
		return new DefaultConnector(curServer.clientPort, curServer.host, opts);
	}

	private hostFilter(socket: IPomeloSocket, cb: (socket: IPomeloSocket) => void) {
		if (!this.useHostFilter) {
			return cb(socket);
		}

		var ip = socket.remoteAddress.ip;
		var check = function (list: string[]) {
			for (var address in list) {
				var exp = new RegExp(list[address]);
				if (exp.test(ip)) {
					socket.disconnect();
					return true;
				}
			}
			return false;
		};
		// dynamical check
		if (this.blacklist.length !== 0 && !!check(this.blacklist)) {
			return;
		}
		// static check
		if (!!this.blacklistFun && typeof this.blacklistFun === 'function') {
			this.blacklistFun((err, list) => {
				if (!!err) {
					logger.error('connector blacklist error: %j', err.stack);
					cb(socket);
					return;
				}
				if (!Array.isArray(list)) {
					logger.error('connector blacklist is not array: %j', list);
					cb(socket);
					return;
				}
				if (!!check(list)) {
					return;
				} else {
					cb(socket);
					return;
				}
			});
		} else {
			cb(socket);
		}
	}

	private bindEvents(socket: IPomeloSocket) {
		var curServer = this.app.getCurServer();
		var maxConnections = curServer['max-connections'];
		if (this.connection && maxConnections) {
			this.connection.increaseConnectionCount();
			var statisticInfo = this.connection.getStatisticsInfo();
			if (statisticInfo.totalConnCount > maxConnections) {
				logger.warn('the server %s has reached the max connections %s', curServer.id, maxConnections);
				socket.disconnect();
				return;
			}
		}

		//create session for connection
		var session = this.getSession(socket);
		var closed = false;

		socket.on('disconnect', () => {
			if (closed) {
				return;
			}
			closed = true;
			if (this.connection) {
				this.connection.decreaseConnectionCount(session.uid);
			}
		});

		socket.on('error', () => {
			if (closed) {
				return;
			}
			closed = true;
			if (this.connection) {
				this.connection.decreaseConnectionCount(session.uid);
			}
		});

		// new message
		socket.on('message', (msg: IPackage) => {
			if (this.useAsyncCoder) {
				return this.handleMessageAsync(msg, session, socket);
			}

			var dmsg: IMessage;
			if (this.decode) {
				dmsg = <IMessage>this.decode(msg, session);
			} else if (this.connector.decode) {
				dmsg = this.connector.decode(msg);
			}
			if (!dmsg) {
				// discard invalid message
				return;
			}

			// use rsa crypto
			if (this.useCrypto) {
				var verified = this.verifyMessage(session, dmsg);
				if (!verified) {
					logger.error('fail to verify the data received from client.');
					return;
				}
			}

			this.handleMessage(session, dmsg);
		});
	}

	private handleMessageAsync(msg: IPackage, session: Session, socket) {
		if (this.decode) {
			this.decode(msg, session, (err, dmsg) => {
				if (err) {
					logger.error('fail to decode message from client %s .', err.stack);
					return;
				}

				this.doHandleMessage(dmsg, session);
			});
		} else if (this.connector.decode) {
			this.connector.decode(msg, socket, (err, dmsg) => {
				if (err) {
					logger.error('fail to decode message from client %s .', err.stack);
					return;
				}

				this.doHandleMessage(dmsg, session);
			});
		}
	}

	private doHandleMessage(dmsg: IMessage, session) {
		if (!dmsg) {
			// discard invalid message
			return;
		}

		// use rsa crypto
		if (this.useCrypto) {
			var verified = this.verifyMessage(session, dmsg);
			if (!verified) {
				logger.error('fail to verify the data received from client.');
				return;
			}
		}

		this.handleMessage(session, dmsg);
	}

	/**
	 * get session for current connection
	 */
	private getSession(socket: IPomeloSocket): Session {
		var app = this.app, sid = socket.id;
		var session = this.session.get(sid);
		if (session) {
			return session;
		}

		session = this.session.create(sid, app.getServerId(), socket);
		logger.debug('[%s] getSession session is created with session id: %s', app.getServerId(), sid);

		// bind events for session
		socket.on('disconnect', session.closed.bind(session));
		socket.on('error', session.closed.bind(session));
		session.on('closed', (session: FrontendSession, reason) => this.onSessionClose(app, session, app));
		session.on('bind', (uid) => {
			logger.debug('session on [%s] bind with uid: %s', this.app.serverId, uid);
			// update connection statistics if necessary
			if (this.connection) {
				this.connection.addLoginedUser(uid, {
					loginTime: Date.now(),
					uid: uid,
					address: socket.remoteAddress.ip + ':' + socket.remoteAddress.port
				});
			}
			this.app.event.emit(events.BIND_SESSION, session);
		});

		session.on('unbind', (uid) => {
			if (this.connection) {
				this.connection.removeLoginedUser(uid);
			}
			this.app.event.emit(events.UNBIND_SESSION, session);
		});

		return session;
	}

	private onSessionClose(app: Application, session: FrontendSession, reason) {
		taskManager.closeQueue(session.id, true);
		app.event.emit(events.CLOSE_SESSION, session);
	}

	private handleMessage(session: Session, msg: IMessage) {
		logger.debug('[%s] handleMessage session id: %s, msg: %j', this.app.serverId, session.id, msg);
		var type = this.checkServerType(msg.route);
		if (!type) {
			logger.error('invalid route string. route : %j', msg.route);
			return;
		}
		this.server.globalHandle(msg, session.toFrontendSession(), (err, resp, opts) => {
			if (resp && !msg.id) {
				logger.warn('try to response to a notify: %j', msg.route);
				return;
			}
			if (!msg.id && !resp) return;
			if (!resp) resp = {};
			if (!!err && !resp.code) {
				resp.code = 500;
			}
			opts = {
				type: 'response',
				userOptions: opts || {}
			};
			// for compatiablity
			opts.isResponse = true;

			this.send(msg.id, msg.route, resp, [session.id], opts,
				function () { });
		});
	}

	/**
	 * Get server type form request message.
	 */
	private checkServerType(route: string) {
		if (!route) {
			return null;
		}
		var idx = route.indexOf('.');
		if (idx < 0) {
			return null;
		}
		return route.substring(0, idx);
	}

	private verifyMessage(session: Session, msg: IMessage) {
		var sig = msg.body.__crypto__;
		if (!sig) {
			logger.error('receive data from client has no signature [%s]', this.app.serverId);
			return false;
		}

		if (!session) {
			logger.error('could not find session.');
			return false;
		}

		var pubKey = session.get('pubKey');
		if (!pubKey) {
			pubKey = this.getPubKey(session.id);
			if (!!pubKey) {
				delete this.keys[session.id];
				session.set('pubKey', pubKey);
			} else {
				logger.error('could not get public key, session id is %s', session.id);
				return false;
			}
		}

		if (!pubKey.n || !pubKey.e) {
			logger.error('could not verify message without public key [%s]', this.app.serverId);
			return false;
		}

		delete msg.body.__crypto__;

		var message = JSON.stringify(msg.body);
		if (utils.hasChineseChar(message))
			message = utils.unicodeToUtf8(message);

		return pubKey.verifyString(message, sig);
	}

}
