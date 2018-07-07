import fs = require('fs')
import path = require('path')
import utils = require('../util/utils')
import { Proxy as ProfileProxy } from '../util/profileProxy'

var profiler = null;
try {
	profiler = require('v8-profiler');
} catch (e) {
}

export class Module implements IModule {
	static moduleId = 'profiler'
	proxy: ProfileProxy

	constructor(opts?: {isMaster?: boolean}) {
		if (opts && opts.isMaster) {
			this.proxy = new ProfileProxy();
		}
	}

	monitorHandler(agent: IMonitorAgent, msg, cb) {
		var type = msg.type, action = msg.action, uid = msg.uid, result = null;
		if (type === 'CPU') {
			if (action === 'start') {
				profiler.startProfiling();
			} else {
				result = profiler.stopProfiling();
				var res = {
					head: result.getTopDownRoot(),
					bottomUpHead: result.getBottomUpRoot(),
					msg: msg,
				};
				agent.notify(module.exports.moduleId, { clientId: msg.clientId, type: type, body: res });
			}
		} else {
			var snapshot = profiler.takeSnapshot();
			var appBase = path.dirname(require.main.filename);
			var name = appBase + '/logs/' + utils.format(new Date()) + '.log';
			var log = fs.createWriteStream(name, { 'flags': 'a' });
			var data;
			snapshot.serialize({
				onData: function (chunk, size) {
					chunk = chunk + '';
					data = {
						method: 'Profiler.addHeapSnapshotChunk',
						params: {
							uid: uid,
							chunk: chunk
						}
					};
					log.write(chunk);
					agent.notify(module.exports.moduleId, { clientId: msg.clientId, type: type, body: data });
				},
				onEnd: function () {
					agent.notify(module.exports.moduleId, { clientId: msg.clientId, type: type, body: { params: { uid: uid } } });
					profiler.deleteAllSnapshots();
				}
			});
		}
	}

	masterHandler(agent: IMasterAgent, msg, cb) {
		if (msg.type === 'CPU') {
			this.proxy.stopCallBack(msg.body, msg.clientId, agent);
		} else {
			this.proxy.takeSnapCallBack(msg.body);
		}
	}

	clientHandler(agent: IMasterAgent, msg, cb) {
		if (msg.action === 'list') {
			this.list(agent, msg, cb);
			return;
		}

		if (typeof msg === 'string') {
			msg = JSON.parse(msg);
		}
		var id = msg.id;
		var command = msg.method.split('.');
		var method = command[1];
		var params = msg.params;
		var clientId = msg.clientId;

		if (!this.proxy[method] || typeof this.proxy[method] !== 'function') {
			return;
		}

		this.proxy[method](id, params, clientId, agent);
	}

	private list(agent: IMasterAgent, msg: any, cb: Callback<ServerId[]>) {
		var servers: ServerId[] = [];
		var idMap = agent.idMap;

		for (var sid in idMap) {
			servers.push(sid);
		}
		cb(null, servers);
	}

}
