/*!
 * Pomelo -- consoleModule monitorLog
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import { exec } from 'child_process'
var path = require('path');
var logger = require('pomelo-logger').getLogger('pomelo-admin', __filename);

var DEFAULT_INTERVAL = 5 * 60;		// in second

interface ILog {
	time: number
	route: string
	serverId: ServerId
	timeUsed: number
	params: string
}

interface IModuleReq {
	serverId: ServerId
	logfile: string
	number: number
}

interface IModuleResp {
	serverId: ServerId
	body: { logfile: string, dataArray: ILog[] }
}

/**
 * Initialize a new 'Module' with the given 'opts'
 *
 * @class Module
 * @constructor
 * @param {object} opts
 * @api public
 */
export class Module implements IModule {
	static moduleId = 'monitorLog'

	root: string
	interval: number

	constructor(opts?: {path?: string, interval?: number}) {
		opts = opts || {};
		this.root = opts.path;
		this.interval = opts.interval || DEFAULT_INTERVAL;
	}

	/**
	* collect monitor data from monitor
	* @param  agent monitorAgent object
	* @param  msg client message
	* @param  cb callback function
	*/
	monitorHandler(agent: IMonitorAgent, msg: IModuleReq, cb: Callback<IModuleResp>) {
		if (!msg.logfile) {
			cb(new Error('logfile should not be empty'));
			return;
		}

		var serverId = agent.id;
		this.fetchLogs(this.root, msg, function (err, data) {
			cb(null, { serverId: serverId, body: data });
		});
	}

	/**
	 * Handle client request
	 * @param  agent masterAgent object
	 * @param  msg client message
	 * @param  cb callback function
	 */
	clientHandler(agent: IMasterAgent, msg: IModuleReq, cb: Callback<IModuleResp>) {
		agent.request(msg.serverId, Module.moduleId, msg, function (err, res: IModuleResp) {
			if (err) {
				logger.error('fail to run log for ' + err.stack);
				return;
			}
			cb(null, res);
		});
	}

	//get the latest logs
	private fetchLogs(root: string, msg: IModuleReq, callback: Callback<{ logfile: string, dataArray: ILog[] }>) {
		var number = msg.number;
		var logfile = msg.logfile;
		var serverId = msg.serverId;
		var filePath = path.join(root, this.getLogFileName(logfile, serverId));

		var endLogs: ILog[] = [];
		exec('tail -n ' + number + ' ' + filePath, function (error, output) {
			var endOut: string[] = [];
			let arr = output.replace(/^\s+|\s+$/g, "").split(/\s+/);

			for (var i = 5; i < arr.length; i += 6) {
				endOut.push(arr[i]);
			}

			var endLength = endOut.length;
			for (var j = 0; j < endLength; j++) {
				var json;
				try {
					json = JSON.parse(endOut[j]);
				} catch (e) {
					logger.error('the log cannot parsed to json, ' + e);
					continue;
				}
				var map: ILog = {
					time: json.time,
					route: json.route || json.service,
					serverId: serverId,
					timeUsed: json.timeUsed,
					params: endOut[j],
				}
				endLogs.push(map);
			}

			callback(null, { logfile, dataArray: endLogs });
		});
	}

	private getLogFileName(logfile: string, serverId: ServerId) {
		return logfile + '-' + serverId + '.log';
	}

}
