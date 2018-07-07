import { EventEmitter } from 'events'
import schedule = require('pomelo-scheduler')
import utils = require('./util/utils')
import { MonitorAgent } from './monitor/monitorAgent'
import { MasterAgent } from './master/masterAgent'
import protocol = require('./util/protocol')

var logger = require('pomelo-logger').getLogger('pomelo-admin', 'ConsoleService');

var MS_OF_SECOND = 1000;

interface IModuleRecord {
	moduleId: string
	module: IModule
	enable: boolean
	delay?: number
	interval?: number
	schedule?: boolean
	jobId?: number
}

interface ILogInfo {
	action: string
	moduleId: string
	msg: AnyMap
	method?: string
	error?: string
}

export interface IAuthSrvMsg {
	[key: string]: any
	id: ServerId
	serverType: ServerType
	type: string
	pid: number
	info: IServerInfo
	token?: string
}

/**
 * ConsoleService Constructor
 *
 * @class ConsoleService
 * @constructor
 * @param {Object} opts construct parameter
 *                 opts.type 	{String} server type, 'master', 'connector', etc.
 *                 opts.id 		{String} server id
 *                 opts.host 	{String} (monitor only) master server host
 *                 opts.port 	{String | Number} listen port for master or master port for monitor
 *                 opts.master  {Boolean} current service is master or monitor
 *                 opts.info 	{Object} more server info for current server, {id, serverType, host, port}
 * @api public
 */
export class ConsoleService extends EventEmitter implements IConsoleService {
	port: number
	env: string
	values: {[moduleId: string]: any} = {}
	master: boolean
	modules: {[moduleId: string]: IModuleRecord} = {}
	authUser: (msg: { username: string, password: string, md5?: boolean }, env: string, cb: (user?: { username: string, password: string }) => void) => void
	authServer: (msg: IAuthSrvMsg, env: string, cb: (result: string) => void) => void
	agent: MasterAgent | MonitorAgent
	type: ServerType
	id: ServerId
	host: string

	constructor(opts: IConsoleServiceOpts) {
		super()
		this.port = opts.port;
		this.env = opts.env;
		this.master = opts.master;

		if (this.master) {
			this.authUser = opts.authUser || utils.defaultAuthUser;
			this.authServer = opts.authServer || utils.defaultAuthServerMaster;
			this.agent = new MasterAgent(this);
		} else {
			this.type = opts.type;
			this.id = opts.id;
			this.host = opts.host;
			this.authServer = opts.authServer || utils.defaultAuthServerMonitor;
			this.agent = new MonitorAgent({
				consoleService: this,
				id: this.id,
				type: this.type,
				info: opts.info
			});
		}
	}

	/**
	 * start master or monitor
	 *
	 * @param {Function} cb callback function
	 * @api public
	 */
	start(cb: Callback<void>) {
		if (this.master) {
			let agent = this.agent as MasterAgent;
			agent.listen(this.port, (err) => {
				if (!!err) {
					cb(err);
					return;
				}

				this.exportEvent(this, this.agent, 'register');
				this.exportEvent(this, this.agent, 'disconnect');
				this.exportEvent(this, this.agent, 'reconnect');
				process.nextTick(cb);
			});
		} else {
			logger.info('try to connect master: %j, %j, %j', this.type, this.host, this.port);
			let agent = this.agent as MonitorAgent;
			agent.connect(this.port, this.host, cb);
			this.exportEvent(this, this.agent, 'close');
		}

		this.exportEvent(this, this.agent, 'error');

		for (var mid in this.modules) {
			this.enable(mid);
		}
	}

	/**
	 * stop console modules and stop master server
	 *
	 * @api public
	 */
	stop() {
		for (var mid of Object.keys(this.modules)) {
			this.disable(mid);
		}
		this.agent.close();
	}

	/**
	 * register a new adminConsole module
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @param {Object} module module object
	 * @api public
	 */
	register(moduleId: string, _module: IModule) {
		this.modules[moduleId] = this.registerRecord(moduleId, _module);
	}

	/**
	 * enable adminConsole module
	 * @param  moduleId adminConsole id/name
	 */
	enable(moduleId: string) {
		var record = this.modules[moduleId];
		if (record && !record.enable) {
			record.enable = true;
			this.addToSchedule(record);
			return true;
		}
		return false;
	}

	/**
	 * disable adminConsole module
	 * @param  moduleId adminConsole id/name
	 */
	disable(moduleId: string) {
		var record = this.modules[moduleId];
		if (record && record.enable) {
			record.enable = false;
			if (record.schedule && record.jobId) {
				schedule.cancelJob(record.jobId);
				record.jobId = null;
			}
			return true;
		}
		return false;
	};

	/**
	 * call concrete module and handler(monitorHandler,masterHandler,clientHandler)
	 * @param  moduleId adminConsole id/name
	 * @param  method handler
	 * @param  msg message
	 * @param  cb callback function
	 */
	execute(moduleId: string, method: 'masterHandler'|'clientHandler'|'monitorHandler', msg: any, cb: Callback<any>) {
		var self = this;
		var m = this.modules[moduleId];
		if (!m) {
			logger.error('unknown module: %j.', moduleId);
			cb('unknown moduleId:' + moduleId);
			return;
		}

		if (!m.enable) {
			logger.error('module %j is disable.', moduleId);
			cb('module ' + moduleId + ' is disable');
			return;
		}

		var _module = m.module;
		if (!_module || typeof _module[method] !== 'function') {
			logger.error('module %j dose not have a method called %j.', moduleId, method);
			cb('module ' + moduleId + ' dose not have a method called ' + method);
			return;
		}

		var log: ILogInfo = { action: 'execute', moduleId, method, msg }

		var aclMsg = this.aclControl('execute', method, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1) {
			log['error'] = aclMsg;
			self.emit('admin-log', log, aclMsg);
			cb(new Error(aclMsg), null);
			return;
		}

		if (method === 'clientHandler') {
			self.emit('admin-log', log);
		}

		(<(agent: IConsoleAgent, msg: any, cb: Callback<any>) => void>_module[method])(this.agent, msg, cb);
	}

	command(command: string, moduleId: string, msg: AnyMap, cb: Callback<any>) {
		var self = this;
		var log: ILogInfo = { action: 'command', moduleId, msg }

		if (command !== 'list' && command !== 'enable' && command !== 'disable') {
			cb('unknown command:' + command)
			return
		}

		var aclMsg = this.aclControl('command', null, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1) {
			log.error = aclMsg;
			self.emit('admin-log', log, aclMsg);
			cb(new Error(aclMsg), null);
			return;
		}

		self.emit('admin-log', log);
		switch (command) {
			case 'list':    this.listCommand(moduleId, cb);         break
			case 'enable':  this.enableCommand(moduleId, msg, cb);  break
			case 'disable': this.disableCommand(moduleId, msg, cb); break
		}
	}

	/**
	 * set module data to a map
	 * @param  moduleId adminConsole id/name
	 * @param  value module data
	 */

	set(moduleId: string, value: any) {
		this.values[moduleId] = value;
	}

	/**
	 * get module data from map
	 * @param  moduleId adminConsole id/name
	 */
	get(moduleId: string): any {
		return this.values[moduleId];
	}

	/**
	 * register a module service
	 * @param  moduleId adminConsole id/name
	 * @param  _module module object
	 */
	private registerRecord(moduleId: string, _module: IModule) {
		var record: IModuleRecord = {
			moduleId: moduleId,
			module: _module,
			enable: false
		};

		if (_module.type && _module.interval) {
			if (!this.master && record.module.type === 'push' || this.master && record.module.type !== 'push') {
				// push for monitor or pull for master(default)
				record.delay = _module.delay || 0;
				record.interval = _module.interval || 1;
				// normalize the arguments
				if (record.delay < 0) {
					record.delay = 0;
				}
				if (record.interval < 0) {
					record.interval = 1;
				}
				record.interval = Math.ceil(record.interval);
				record.delay *= MS_OF_SECOND;
				record.interval *= MS_OF_SECOND;
				record.schedule = true;
			}
		}

		return record;
	};

	/**
	 * schedule console module
	 * @param  record  module object
	 */
	private addToSchedule(record: IModuleRecord) {
		if (record && record.schedule) {
			record.jobId = schedule.scheduleJob({
				start: Date.now() + record.delay,
				period: record.interval
			},
			(record) => this.doScheduleJob(record), record);
		}
	}

	/**
	 * run schedule job
	 *
	 * @param {Object} args argments
	 * @api private
	 */
	private doScheduleJob(record: IModuleRecord) {
		if (!record || !record.module || !record.enable) {
			return;
		}

		if (this.master) {
			record.module.masterHandler(<MasterAgent>this.agent, null, function (err) {
				logger.error('interval push should not have a callback.');
			});
		} else {
			record.module.monitorHandler(<MonitorAgent>this.agent, null, function (err) {
				logger.error('interval push should not have a callback.');
			});
		}
	}

	/**
	 * export closure function out
	 *
	 * @param {Function} outer outer function
	 * @param {Function} inner inner function
	 * @param {object} event
	 * @api private
	 */
	private exportEvent(outer: EventEmitter, inner: EventEmitter, event: string) {
		inner.on(event, function () {
			var args = Array.prototype.slice.call(arguments, 0);
			args.unshift(event);
			outer.emit.apply(outer, args);
		});
	}

	/**
	 * List current modules
	 */
	private listCommand(moduleId: string, cb: Callback<{modules: string[]}>) {
		var modules = this.modules;

		var result: string[] = [];
		for (var moduleId in modules) {
			if (/^__\w+__$/.test(moduleId)) {
				continue;
			}

			result.push(moduleId);
		}

		cb(null, {
			modules: result
		});
	}

	/**
	 * enable module in current server
	 */
	private enableCommand(moduleId: string, msg, cb: Callback<number>) {
		if (!moduleId) {
			logger.error('fail to enable admin module for ' + moduleId);
			cb('empty moduleId');
			return;
		}

		if (!this.modules[moduleId]) {
			cb(null, protocol.PRO_FAIL);
			return;
		}

		if (this.master) {
			this.enable(moduleId);
			let agent = <MasterAgent>this.agent;
			agent.notifyCommand("enable", moduleId, msg);
			cb(null, protocol.PRO_OK);
		} else {
			this.enable(moduleId);
			cb(null, protocol.PRO_OK);
		}
	}

	/**
	 * disable module in current server
	 */
	private disableCommand(moduleId: string, msg, cb: Callback<number>) {
		if (!moduleId) {
			logger.error('fail to enable admin module for ' + moduleId);
			cb('empty moduleId');
			return;
		}

		if (!this.modules[moduleId]) {
			cb(null, protocol.PRO_FAIL);
			return;
		}

		if (this.master) {
			this.disable(moduleId);
			let agent = <MasterAgent>this.agent;
			agent.notifyCommand("disable", moduleId, msg);
			cb(null, protocol.PRO_OK);
		} else {
			this.disable(moduleId);
			cb(null, protocol.PRO_OK);
		}
	}

	private aclControl(action: string, method: string, moduleId: string, msg: AnyMap): 0|1|string {
		if (action === 'execute') {
			if (method !== 'clientHandler' || moduleId !== '__console__') {
				return 0;
			}

			var signal = msg.signal;
			if (!signal || !(signal === 'stop' || signal === 'add' || signal === 'kill')) {
				return 0;
			}
		}

		var clientId = msg.clientId;
		if (!clientId) {
			return 'Unknow clientId';
		}

		let agent = <MasterAgent>this.agent
		var _client = agent.getClientById(clientId);
		if (_client && _client.info && _client.info.level) {
			var level = _client.info.level;
			if (level > 1) {
				return 'Command permission denied';
			}
		} else {
			return 'Client info error';
		}
		return 1;
	}

}

/**
 * Create master ConsoleService
 *
 * @param  opts construct parameter
 *              opts.port {String | Number} listen port for master console
 */
export function createMasterConsole(opts?: IConsoleServiceOpts) {
	opts = opts || {};
	opts.master = true;
	return new ConsoleService(opts);
}

/**
 * Create monitor ConsoleService
 *
 * @param {Object} opts construct parameter
 *                      opts.type {String} server type, 'master', 'connector', etc.
 *                      opts.id {String} server id
 *                      opts.host {String} master server host
 *                      opts.port {String | Number} master port
 */
export function createMonitorConsole(opts: IConsoleServiceOpts) {
	return new ConsoleService(opts);
}
