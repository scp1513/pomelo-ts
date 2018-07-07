import events = require('../util/events');
import Constants = require('../util/constants');
import { Application } from '../application';

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class Module implements IModule {
	static moduleId = Constants.KEYWORDS.MONITOR_WATCHER

	app: Application
	service: IConsoleService
	id: ServerId

	constructor(opts: {app: Application}, consoleService: IConsoleService) {
		this.app = opts.app;
		this.service = consoleService;
		this.id = this.app.getServerId();

		this.app.event.on(events.START_SERVER, (id: ServerId) => this.finishStart(id));
	}

	start(cb: Callback<void>) {
		this.subscribeRequest(this.service.agent as IMonitorAgent, this.id, cb);
	}

	monitorHandler(agent: IMonitorAgent, msg: any, cb: Callback<number>) {
		if (!msg || !msg.action) {
			return;
		}
		switch (msg.action) {
			case 'addServer': this.addServer(msg, cb); break
			case 'removeServer': this.removeServer(msg, cb); break
			case 'replaceServer': this.replaceServer(msg, cb); break
			case 'startOver': this.startOver(cb); break
			default: logger.info('monitorwatcher unknown action: %j', msg.action)
		}
	}

	// ----------------- monitor start method -------------------------

	private subscribeRequest(agent: IMonitorAgent, id: ServerId, cb: Callback<void>) {
		var msg = { action: 'subscribe', id: id };
		agent.request(Constants.KEYWORDS.MASTER_WATCHER, msg, (err, servers: {[id: string]: IServerInfo}) => {
			if (err) {
				logger.error('subscribeRequest request to master with error: %j', err.stack);
				cb(err);
			}
			var res = [];
			for (var id in servers) {
				res.push(servers[id]);
			}
			this.addServers(res);
			cb();
		});
	}

	// ----------------- monitor request methods -------------------------

	private addServer(msg: {server: IServerInfo}, cb: Callback<number>) {
		logger.debug('[%s] receive addServer signal: %j', this.app.serverId, msg);
		if (!msg || !msg.server) {
			logger.warn('monitorwatcher addServer receive empty message: %j', msg);
			cb(null, Constants.SIGNAL.FAIL);
			return;
		}
		this.addServers([msg.server]);
		cb(null, Constants.SIGNAL.OK);
	}

	private removeServer(msg: {id: ServerId}, cb: Callback<number>) {
		logger.debug('%s receive removeServer signal: %j', this.app.serverId, msg);
		if (!msg || !msg.id) {
			logger.warn('monitorwatcher removeServer receive empty message: %j', msg);
			cb(null, Constants.SIGNAL.FAIL);
			return;
		}
		this.removeServers([msg.id]);
		cb(null, Constants.SIGNAL.OK);
	}

	private replaceServer(msg:{ servers: { [id: string]: IServerInfo }}, cb: Callback<number>) {
		logger.debug('%s receive replaceServer signal: %j', this.app.serverId, msg);
		if (!msg || !msg.servers) {
			logger.warn('monitorwatcher replaceServer receive empty message: %j', msg);
			cb(null, Constants.SIGNAL.FAIL);
			return;
		}
		this.replaceServers(msg.servers);
		cb(null, Constants.SIGNAL.OK);
	}

	private startOver(cb: Callback<number>) {
		var fun = <AfterStartupAllHandler>this.app.lifecycleCbs[Constants.LIFECYCLE.AFTER_STARTALL];
		if (!!fun) {
			fun(this.app);
		}
		this.app.event.emit(events.START_ALL);
		cb(null, Constants.SIGNAL.OK);
	}

	// ----------------- common methods -------------------------

	private addServers(servers: IServerInfo[]) {
		if (!servers || !servers.length) {
			return;
		}
		this.app.addServers(servers);
	}

	private removeServers(ids: ServerId[]) {
		if (!ids || !ids.length) {
			return;
		}
		this.app.removeServers(ids);
	}

	private replaceServers(servers: { [id: string]: IServerInfo }) {
		this.app.replaceServers(servers);
	}

	// ----------------- bind methods -------------------------

	private finishStart(id: ServerId) {
		let msg = { action: 'record', id };
		let agent = this.service.agent as IMonitorAgent
		agent.notify(Constants.KEYWORDS.MASTER_WATCHER, msg);
	}

}
