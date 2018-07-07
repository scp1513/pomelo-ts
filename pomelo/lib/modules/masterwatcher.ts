import { Application } from "../application";
import { MasterWatchdog } from '../master/watchdog';
import Constants = require('../util/constants');

let logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class Module implements IModule {
	static moduleId = Constants.KEYWORDS.MASTER_WATCHER

	app: Application
	service: IConsoleService
	id: ServerId
	watchdog: MasterWatchdog

	constructor(opts: {app: Application}, consoleService: IConsoleService) {
		this.app = opts.app;
		this.service = consoleService;
		this.id = this.app.getServerId();

		this.watchdog = new MasterWatchdog(this.app, this.service);
		this.service.on('register', (record) => this.onServerAdd(record));
		this.service.on('disconnect', (id, type) => this.onServerLeave(id, type));
		this.service.on('reconnect', (record) => this.onServerReconnect(record));
	}

	// ----------------- bind methods -------------------------

	private onServerAdd(record: IServerInfo & {type: string}) {
		logger.debug('masterwatcher receive add server event, with server: %j', record);
		if (!record || record.type === 'client' || !record.serverType) {
			return;
		}
		this.watchdog.addServer(record);
	}

	private onServerReconnect(record: IServerInfo & {type: string}) {
		logger.debug('masterwatcher receive reconnect server event, with server: %j', record);
		if (!record || record.type === 'client' || !record.serverType) {
			logger.warn('onServerReconnect receive wrong message: %j', record);
			return;
		}
		this.watchdog.reconnectServer(record);
	}

	private onServerLeave(id: ServerId, type: string) {
		logger.debug('masterwatcher receive remove server event, with server: %s, type: %s', id, type);
		if (!id) {
			logger.warn('onServerLeave receive server id is empty.');
			return;
		}
		if (type !== 'client') {
			this.watchdog.removeServer(id);
		}
	}

	// ----------------- module methods -------------------------

	start(cb: Callback<void>) {
		cb();
	}

	masterHandler(agent: IMasterAgent, msg: any, cb: Callback<any>) {
		if (!msg) {
			logger.warn('masterwatcher receive empty message.');
			return;
		}
		switch (msg.action) {
			case 'subscribe': this.subscribe(msg, cb); break
			case 'unsubscribe': this.unsubscribe(msg, cb); break
			case 'query': this.query(cb); break
			case 'record': this.record(msg, cb); break
			default: logger.info('masterwatcher unknown action: %j', msg.action)
		}
	}

	// ----------------- monitor request methods -------------------------

	private subscribe(msg: {id: ServerId}, cb: Callback<{[id: string]: IServerInfo}>) {
		if (!msg) {
			cb(new Error('masterwatcher subscribe empty message.'));
			return;
		}

		this.watchdog.subscribe(msg.id);
		cb(null, this.watchdog.query());
	}

	private unsubscribe(msg: {id: ServerId}, cb: Callback<void>) {
		if (!msg) {
			cb(new Error('masterwatcher unsubscribe empty message.'));
			return;
		}
		this.watchdog.unsubscribe(msg.id);
		cb();
	}

	private query(cb: Callback<{[id: string]: IServerInfo}>) {
		cb(null, this.watchdog.query());
	}

	private record(msg: {id: ServerId}, cb: Callback<void>) {
		if (!msg) {
			cb(new Error('masterwatcher record empty message.'));
			return;
		}
		this.watchdog.record(msg.id);
		// notify no need to callback
		//cb();
	}

}
