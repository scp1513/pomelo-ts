import { exec } from 'child_process'
import { Application } from "../application"
import { Component as Connector } from '../components/connector'

import countDownLatch = require('../util/countDownLatch');
import utils = require('../util/utils');
import Constants = require('../util/constants');
import starter = require('../master/starter');
let logger = require('pomelo-logger').getLogger('pomelo', __filename);

interface ISrvLstItem {
	serverId: ServerId
	serverType: ServerType
	pid: number
	rss: string
	heapTotal: string
	heapUsed: string
	uptime: string
}

interface _ICronInfo extends ICronInfo {
	serverType?: ServerType
}

export class Module implements IModule {
	static moduleId = '__console__'

	app: Application

	constructor(opts: {app: Application}) {
		this.app = opts.app;
	}

	monitorHandler(agent: IMonitorAgent, msg: any, cb: Callback<any>) {
		var serverId = agent.id;
		switch (msg.signal) {
			case 'stop':
				if (agent.type === Constants.RESERVED.MASTER) {
					return;
				}
				this.app.stop(true);
				break;
			case 'list':
				let item: ISrvLstItem = {
					serverId: serverId,
					serverType: agent.type,
					pid: process.pid,
					heapUsed: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2),
					rss: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2),
					heapTotal: (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2),
					uptime: (process.uptime() / 60).toFixed(2),
				}
				cb(null, item);
				break;
			case 'kill':
				utils.invokeCallback(cb, null, serverId);
				if (agent.type !== 'master') {
					setTimeout(function () {
						process.exit(-1);
					}, Constants.TIME.TIME_WAIT_MONITOR_KILL);
				}
				break;
			case 'addCron':
				this.app.addCrons([msg.cron]);
				break;
			case 'removeCron':
				this.app.removeCrons([msg.cron]);
				break;
			case 'blacklist':
				if (this.app.isFrontend()) {
					var connector = this.app.components.__connector__ as Connector;
					connector.blacklist = connector.blacklist.concat(msg.blacklist);
				}
				break;
			case 'restart':
				if (agent.type === Constants.RESERVED.MASTER) {
					return;
				}
				var self = this;
				var server = this.app.get<IServerInfo>(Constants.RESERVED.CURRENT_SERVER);
				cb(null, { server });
				process.nextTick(function () {
					self.app.stop(true);
				});
				break;
			default:
				logger.error('receive error signal: %j', msg);
				break;
		}
	}

	clientHandler(agent: IMasterAgent, msg: any, cb: Callback<any>) {
		switch (msg.signal) {
			case 'kill':
				this.kill(agent, msg, cb);
				break;
			case 'stop':
				this.stop(agent, msg, cb);
				break;
			case 'list':
				this.list(agent, msg, cb);
				break;
			case 'add':
				this.add(msg, cb);
				break;
			case 'addCron':
				this.addCron(agent, msg, cb);
				break;
			case 'removeCron':
				this.removeCron(agent, msg, cb);
				break;
			case 'blacklist':
				this.blacklist(agent, msg, cb);
				break;
			case 'restart':
				this.restart(agent, msg, cb);
				break;
			default:
				utils.invokeCallback(cb, new Error('The command cannot be recognized, please check.'), null);
				break;
		}
	}

	private kill(agent: IMasterAgent, msg: { signal: string }, cb: Callback<{code: string, serverIds?: ServerId[]}>) {
		let serverIds: ServerId[] = [];
		let count = utils.size(agent.idMap);
		let latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_MASTER_KILL }, function (isTimeout) {
			if (!isTimeout) {
				utils.invokeCallback(cb, null, { code: 'ok' });
			} else {
				utils.invokeCallback(cb, null, { code: 'remained', serverIds: serverIds });
			}
			setTimeout(function () {
				process.exit(-1);
			}, Constants.TIME.TIME_WAIT_MONITOR_KILL);
		})

		let agentRequestCallback = function (err: AnyErr, serverId: ServerId) {
			for (let i = 0; i < serverIds.length; ++i) {
				if (serverIds[i] === serverId) {
					serverIds.splice(i, 1);
					latch.done();
					break;
				}
			}
		};

		for (let sid in agent.idMap) {
			let record = agent.idMap[sid];
			serverIds.push(record.id);
			agent.request(record.id, Module.moduleId, { signal: msg.signal }, agentRequestCallback);
		}
	}

	private stop(agent: IMasterAgent, msg: { signal: string, ids?: ServerId[] }, cb: Callback<{status: 'part'|'all'}>) {
		let servers = this.app.getServers();
		let serverIds = msg.ids;
		if (serverIds && !!serverIds.length) {
			this.app.set(Constants.RESERVED.STOP_SERVERS, serverIds);
			for (let i = 0; i < serverIds.length; i++) {
				let serverId = serverIds[i];
				if (!servers[serverId]) {
					cb(new Error('Cannot find the server to stop.'));
				} else {
					agent.notifyById(serverId, Module.moduleId, { signal: msg.signal });
				}
			}
			cb(null, { status: "part" });
		} else {
			serverIds = [];
			let servers = this.app.getServers();
			for (let i in servers) {
				serverIds.push(i)
			}
			this.app.set(Constants.RESERVED.STOP_SERVERS, serverIds);
			agent.notifyAll(Module.moduleId, { signal: msg.signal });
			setTimeout(() => {
				this.app.stop(true);
				cb(null, { status: "all" });
			}, Constants.TIME.TIME_WAIT_STOP);
		}
	}

	private restart(agent: IMasterAgent, msg: { signal: string, ids?: ServerId[], type?: ServerType }, cb: Callback<ServerId[]>) {
		var successFlag: boolean;
		var successIds: ServerId[] = [];
		var serverIds = msg.ids;
		var type = msg.type;
		var servers;
		if (!serverIds.length && !!type) {
			servers = this.app.getServersByType(type);
			if (!servers) {
				cb(new Error('restart servers with unknown server type: ' + type));
				return;
			}
			for (var i = 0; i < servers.length; i++) {
				serverIds.push(servers[i].id);
			}
		} else if (!serverIds.length) {
			servers = this.app.getServers();
			for (var key in servers) {
				serverIds.push(key);
			}
		}
		var count = serverIds.length;
		var latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_COUNTDOWN }, function () {
			if (!successFlag) {
				return cb(new Error('all servers start failed.'));
			}
			cb(null, utils.arrayDiff(serverIds, successIds));
		});

		var request = (id: ServerId) => {
			agent.request(id, Module.moduleId, { signal: msg.signal }, (err, resp: { server: IServerInfo }) => {
				if (!utils.size(resp)) {
					latch.done();
					return;
				}
				setTimeout(() => {
					this.runServer(this.app, resp.server, (err, status) => {
						if (!!err) {
							logger.error('restart ' + id + ' failed.');
						} else {
							successIds.push(id);
							successFlag = true;
						}
						latch.done();
					});
				}, Constants.TIME.TIME_WAIT_RESTART);
			});
		};

		for (var j = 0; j < serverIds.length; j++) {
			request(serverIds[j]);
		}
	}

	private list(agent: IMasterAgent, msg: { signal: string }, cb: Callback<{msg: { [id: string]: ISrvLstItem }}>) {
		var serverInfo: { [id: string]: ISrvLstItem } = {};
		var count = utils.size(agent.idMap);
		var latch = countDownLatch.createCountDownLatch(count, { timeout: Constants.TIME.TIME_WAIT_COUNTDOWN }, function () {
			cb(null, { msg: serverInfo });
		});

		var callback: Callback<ISrvLstItem> = function (err, msg) {
			serverInfo[msg.serverId] = msg;
			latch.done();
		};
		for (let sid in agent.idMap) {
			let record = agent.idMap[sid];
			agent.request(record.id, Module.moduleId, { signal: msg.signal }, callback);
		}
	}

	private add(msg: {args: string[]}, cb: Callback<{ status: 'ok' } | IServerInfo[]>) {
		if (this.checkCluster(msg)) {
			this.startCluster(this.app, msg, cb); // cb: IServerInfo[]
		} else {
			this.startServer(this.app, msg, cb); // cb: { status: 'ok' }
		}
		this.reset(ServerInfo);
	}

	private addCron(agent: IMasterAgent, msg: {signal: string, args: string[]}, cb: Callback<{status: "ok"}>) {
		var cron = this.parseArgs<_ICronInfo>(msg, CronInfo);
		this.sendCronInfo(cron, agent, msg, CronInfo, cb);
	}

	private removeCron(agent: IMasterAgent, msg: {signal: string, args: string[]}, cb: Callback<{status: "ok"}>) {
		var cron = this.parseArgs<_ICronInfo>(msg, RemoveCron);
		this.sendCronInfo(cron, agent, msg, RemoveCron, cb);
	}

	private blacklist(agent: IMasterAgent, msg: {signal:string, args: string[]}, cb: Callback<{status:"ok"}>) {
		var ips = msg.args;
		for (var i = 0; i < ips.length; i++) {
			if (!(new RegExp(/(\d+)\.(\d+)\.(\d+)\.(\d+)/g).test(ips[i]))) {
				cb(new Error('blacklist ip: ' + ips[i] + ' is error format.'), null);
				return;
			}
		}
		agent.notifyAll(Module.moduleId, { signal: msg.signal, blacklist: msg.args });
		process.nextTick(() => cb(null, { status: "ok" }))
	}

	private checkPort(server: IServerInfo, cb: (status: string) => void) {
		if (!server.port && !server.clientPort) {
			cb('leisure');
			return;
		}

		var p = server.port || server.clientPort;
		var host = server.host;
		var cmd = 'netstat -tln | grep ';
		if (!utils.isLocal(host)) {
			cmd = 'ssh ' + host + ' ' + cmd;
		}

		exec(cmd + p, function (err, stdout, stderr) {
			if (stdout || stderr) {
				cb('busy');
			} else {
				p = server.clientPort;
				exec(cmd + p, function (err, stdout, stderr) {
					if (stdout || stderr) {
						cb('busy');
					} else {
						cb('leisure');
					}
				});
			}
		});
	}

	private parseArgs<T>(msg: {args: string[]}, info: {[key:string]:number}): T {
		var rs: any = {};
		var args = msg.args;
		for (var i = 0; i < args.length; i++) {
			if (args[i].indexOf('=') < 0) {
				return null;
			}
			var pairs = args[i].split('=');
			var key = pairs[0];
			if (!!info[key]) {
				info[key] = 1;
			}
			rs[pairs[0]] = pairs[1];
		}
		return rs;
	}

	private sendCronInfo(cron: _ICronInfo, agent: IMasterAgent, msg: {signal: string}, info: AnyMap, cb: Callback<{status: "ok"}>) {
		if (this.isReady(info) && (cron.serverId || cron.serverType)) {
			if (!!cron.serverId) {
				agent.notifyById(cron.serverId, Module.moduleId, { signal: msg.signal, cron: cron });
			} else {
				agent.notifyByType(cron.serverType, Module.moduleId, { signal: msg.signal, cron: cron });
			}
			process.nextTick(function () {
				cb(null, { status: "ok" });
			});
		} else {
			cb(new Error('Miss necessary server parameters.'), null);
		}
		this.reset(info);
	}

	private startServer(app: Application, msg: {args: string[]}, cb: Callback<{ status: 'ok' }>) {
		var server = this.parseArgs<IServerInfo>(msg, ServerInfo);
		if (this.isReady(ServerInfo)) {
			this.runServer(app, server, cb);
		} else {
			cb(new Error('Miss necessary server parameters.'), null);
		}
	}

	private runServer(app: Application, server: IServerInfo, cb: Callback<{ status: 'ok' }>) {
		this.checkPort(server, (status) => {
			if (status === 'busy') {
				cb(new Error('Port occupied already, check your server to add.'));
			} else {
				starter.run(app, server, (err) => {
					if (err) {
						cb(err, null);
						return;
					}
				});
				process.nextTick(() => {
					cb(null, { status: "ok" });
				});
			}
		});
	}

	private startCluster(app: Application, msg: {args: string[]}, cb: Callback<IServerInfo[]>) {
		var serverMap: { [id: string]: IServerInfo } = {};
		var fails: IServerInfo[] = [];
		var successFlag: boolean;
		var serverInfo = this.parseArgs<IServerInfo>(msg, ClusterInfo);
		utils.loadCluster(app, serverInfo, serverMap);
		var count = utils.size(serverMap);
		var latch = countDownLatch.createCountDownLatch(count, {}, function () {
			if (!successFlag) {
				cb(new Error('all servers start failed.'));
				return;
			}
			cb(null, fails);
		});

		var start = (server: IServerInfo) => {
			this.checkPort(server, (status) => {
				if (status === 'busy') {
					fails.push(server);
					latch.done();
				} else {
					starter.run(app, server, function (err) {
						if (err) {
							fails.push(server);
							latch.done();
						}
					});
					process.nextTick(function () {
						successFlag = true;
						latch.done();
					});
				}
			});
		};
		for (var key in serverMap) {
			var server = serverMap[key];
			start(server);
		}
	}

	private checkCluster(msg: {args:string[]}) {
		var flag = false;
		var args = msg.args;
		for (var i = 0; i < args.length; i++) {
			if (utils.startsWith(args[i], Constants.RESERVED.CLUSTER_COUNT)) {
				flag = true;
			}
		}
		return flag;
	}

	private isReady(info: AnyMap) {
		for (var key in info) {
			if (info[key]) {
				return false;
			}
		}
		return true;
	}

	private reset(info: AnyMap) {
		for (var key in info) {
			info[key] = 0;
		}
	}
}

let ServerInfo = {
	host: 0,
	port: 0,
	id: 0,
	serverType: 0
};

let CronInfo = {
	id: 0,
	action: 0,
	time: 0
};

let RemoveCron = {
	id: 0
};

let ClusterInfo = {
	host: 0,
	port: 0,
	clusterCount: 0
};
