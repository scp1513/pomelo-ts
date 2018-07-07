/*!
 * Pomelo -- consoleModule nodeInfo processInfo
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import monitor = require('pomelo-monitor');

var DEFAULT_INTERVAL = 5 * 60;		// in second
var DEFAULT_DELAY = 10;				// in second

interface IInfo {
}

export class Module implements IModule {
	static moduleId = 'nodeInfo'
	type: 'push'|'pull'
	interval: number
	delay: number

	constructor(opts?: {type?: 'push'|'pull', interval?: number, delay?: number}) {
		opts = opts || {};
		this.type = opts.type || 'pull';
		this.interval = opts.interval || DEFAULT_INTERVAL;
		this.delay = opts.delay || DEFAULT_DELAY;
	}

	monitorHandler(agent: IMonitorAgent, msg: void, cb: Callback<void>) {
		var serverId = agent.id
		var pid = process.pid
		var params = { serverId, pid }
		monitor.psmonitor.getPsInfo(params, function (err, body: IInfo) {
			agent.notify<{serverId: ServerId, body: IInfo}>(Module.moduleId, { serverId: agent.id, body })
		})
	}

	masterHandler(agent: IMasterAgent, msg: {serverId: ServerId, body: {serverId: ServerId, body: IInfo}}, cb: Callback<void>) {
		if (!msg) {
			agent.notifyAll(Module.moduleId, null);
			return;
		}

		var body = msg.body;
		var data = agent.get<{[serverId: string]: IInfo}>(Module.moduleId);
		if (!data) {
			data = {};
			agent.set(Module.moduleId, data);
		}

		data[msg.serverId] = body;
	}

	clientHandler(agent: IMasterAgent, msg: void, cb: Callback<{[serverId: string]: IInfo}>) {
		cb(null, agent.get(Module.moduleId) || {});
	}

}
