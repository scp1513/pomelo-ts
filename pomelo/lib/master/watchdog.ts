import { EventEmitter } from 'events'
import { Application } from '../application';
import utils = require('../util/utils');
import Constants = require('../util/constants');
import countDownLatch = require('../util/countDownLatch');
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class MasterWatchdog extends EventEmitter {
	app: Application
	service: IConsoleService
	isStarted = false
	count: number
	servers: {[id: string]: IServerInfo}
	listenSrvs: {[id: string]: number}

	constructor(app: Application, service: IConsoleService) {
		super()

		this.app = app;
		this.service = service;
		this.count = utils.size(app.getServersFromConfig());

		this.servers = {};
		this.listenSrvs = {};
	}

	addServer(server: IServerInfo) {
		if (!server) {
			return;
		}
		this.servers[server.id] = server;
		this.notify({ action: 'addServer', server });
	}

	removeServer(id: ServerId) {
		if (!id) {
			return;
		}
		this.unsubscribe(id);
		delete this.servers[id];
		this.notify({ action: 'removeServer', id });
	}

	reconnectServer(server: IServerInfo) {
		var self = this;
		if (!server) {
			return;
		}
		if (!this.servers[server.id]) {
			this.servers[server.id] = server;
		}
		//replace server in reconnect server
		this.notifyById(server.id, { action: 'replaceServer', servers: self.servers });
		// notify other server to add server
		this.notify({ action: 'addServer', server });
		// add server in listener
		this.subscribe(server.id);
	}

	subscribe(id: ServerId) {
		this.listenSrvs[id] = 1;
	}

	unsubscribe(id: ServerId) {
		delete this.listenSrvs[id];
	}

	query() {
		return this.servers;
	}

	record(id: ServerId) {
		if (!this.isStarted && --this.count < 0) {
			let usedTime = Date.now() - this.app.startTime;
			logger.info('all servers startup in %s ms', usedTime);
			this.notify({ action: 'startOver' });
			this.isStarted = true;
		}
	}

	notifyById(id: ServerId, msg: AnyMap) {
		let agent = this.service.agent as IMasterAgent
		agent.request(id, Constants.KEYWORDS.MONITOR_WATCHER, msg, function (err, signal: number) {
			if (signal !== Constants.SIGNAL.OK) {
				logger.error('master watchdog fail to notify to monitor, id: %s, msg: %j', id, msg);
			} else {
				logger.debug('master watchdog notify to monitor success, id: %s, msg: %j', id, msg);
			}
		});
	}

	notify(msg: AnyMap) {
		let listeners = this.listenSrvs;
		let success = true;
		let fails: string[] = [];
		let timeouts: string[] = [];
		let requests: {[key: string]: number} = {};
		let count = utils.size(listeners);
		if (count === 0) {
			logger.warn('master watchdog listeners is none, msg: %j', msg);
			return;
		}
		let latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_COUNTDOWN }, function (isTimeout) {
			if (!!isTimeout) {
				for (let key in requests) {
					if (!requests[key]) {
						timeouts.push(key);
					}
				}
				logger.error('master watchdog request timeout message: %j, timeouts: %j, fails: %j', msg, timeouts, fails);
			}
			if (!success) {
				logger.error('master watchdog request fail message: %j, fails: %j', msg, fails);
			}
		});

		let moduleRequest = (id: string) => {
			return (() => {
				let agent = this.service.agent as IMasterAgent
				agent.request(id, Constants.KEYWORDS.MONITOR_WATCHER, msg, (err, signal: number) => {
					if (signal !== Constants.SIGNAL.OK) {
						fails.push(id);
						success = false;
					}
					requests[id] = 1;
					latch.done();
				});
			})();
		};

		for (let id in listeners) {
			requests[id] = 0;
			moduleRequest(id);
		}
	}

}
