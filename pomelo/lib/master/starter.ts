import os = require('os');
import util = require('util');
import cp = require('child_process');
import utils = require('../util/utils');
import Constants = require('../util/constants');
import pomelo = require('../pomelo');
import { Application } from '../application';

let logger = require('pomelo-logger').getLogger('pomelo', __filename);
let cpus: {[sid: string]: number} = {};
let env = Constants.RESERVED.ENV_DEV;

/**
 * Run all servers
 * @param app current application  context
 */
export function runServers(app: Application) {
	let server: IServerInfo
	let servers: {[id: string]: IServerInfo}
	let srvlst: IServerInfo[]
	let condition = app.get<ServerId>(Constants.RESERVED.STARTID) || app.get<ServerType>(Constants.RESERVED.TYPE);
	switch (condition) {
		case Constants.RESERVED.MASTER:
			break;
		case Constants.RESERVED.ALL:
			servers = app.getServersFromConfig();
			for (var serverId in servers) {
				run(app, servers[serverId]);
			}
			break;
		default:
			server = app.getServerFromConfig(condition);
			if (!!server) {
				run(app, server);
			} else {
				srvlst = app.get<{[type: string]: IServerInfo[]}>(Constants.RESERVED.SERVERS)[condition];
				for (var i = 0; i < srvlst.length; i++) {
					run(app, srvlst[i]);
				}
			}
	}
}

/**
 * Run server
 *
 * @param {Object} app current application context
 * @param {Object} server
 * @return {Void}
 */
export function run(app: Application, server: IServerInfo, cb?: Callback<void>) {
	env = app.get(Constants.RESERVED.ENV);
	var cmd: string;
	if (utils.isLocal(server.host)) {
		var options: string[] = [];
		if (!!server.args) {
			if (typeof server.args === 'string') {
				options.push(server.args.trim());
			} else {
				options = options.concat(server.args);
			}
		}
		cmd = app.get(Constants.RESERVED.MAIN);
		options.push(cmd);
		options.push(util.format('env=%s', env));
		for (let key in server) {
			if (key === Constants.RESERVED.CPU) {
				cpus[server.id] = server.cpu;
			}
			options.push(util.format('%s=%s', key, (<AnyMap>server)[key]));
		}
		localrun(process.execPath, null, options, cb);
	} else {
		cmd = util.format('cd "%s" && "%s"', app.getBase(), process.execPath);
		var arg = server.args;
		if (!!arg) {
			cmd += arg;
		}
		cmd += util.format(' "%s" env=%s ', app.get(Constants.RESERVED.MAIN), env);
		for (let key in server) {
			if (key === Constants.RESERVED.CPU) {
				cpus[server.id] = server.cpu;
			}
			cmd += util.format(' %s=%s ', key, (<AnyMap>server)[key]);
		}
		sshrun(cmd, server.host, cb);
	}
}

/**
 * Bind process with cpu
 * @param  sid server id
 * @param  pid process id
 * @param  host server host
 */
export function bindCpu(sid: ServerId, pid: number, host: string) {
	if (os.platform() === Constants.PLATFORM.LINUX && Object.prototype.hasOwnProperty.call(cpus, sid)) {
		if (utils.isLocal(host)) {
			localrun(Constants.COMMAND.TASKSET, null, ['-pc', String(cpus[sid]), String(pid)]);
		} else {
			var cmd = util.format('taskset -pc "%s" "%s"', String(cpus[sid]), String(pid));
			sshrun(cmd, host, null);
		}
	}
}

/**
 * Kill application in all servers
 *
 * @param {String} pids  array of server's pid
 * @param {String} serverIds array of serverId
 */
export function kill(pids, servers: IServerInfo[]) {
	var cmd;
	for (var i = 0; i < servers.length; i++) {
		var server = servers[i];
		if (utils.isLocal(server.host)) {
			var options = [];
			if (os.platform() === Constants.PLATFORM.WIN) {
				cmd = Constants.COMMAND.TASKKILL;
				options.push('/pid');
				options.push('/f');
			} else {
				cmd = Constants.COMMAND.KILL;
				options.push(-9);
			}
			options.push(pids[i]);
			localrun(cmd, null, options);
		} else {
			if (os.platform() === Constants.PLATFORM.WIN) {
				cmd = util.format('taskkill /pid %s /f', pids[i]);
			} else {
				cmd = util.format('kill -9 %s', pids[i]);
			}
			sshrun(cmd, server.host);
		}
	}
}

/**
 * Use ssh to run command.
 *
 * @param {String} cmd command that would be executed in the remote server
 * @param {String} host remote server host
 * @param {Function} cb callback function
 *
 */
export function sshrun(cmd: string, host: string, cb?) {
	let args: string[] = [];
	args.push(host);
	var ssh_params = pomelo.app.get<string[]>(Constants.RESERVED.SSH_CONFIG_PARAMS);
	if (!!ssh_params && Array.isArray(ssh_params)) {
		args = args.concat(ssh_params);
	}
	args.push(cmd);

	logger.info('Executing ' + cmd + ' on ' + host + ':22');
	spawnProcess(Constants.COMMAND.SSH, host, args, cb);
	return;
}

/**
 * Run local command.
 *
 * @param  cmd
 * @param  cb
 *
 */
export function localrun(cmd: string, host: string, options: string[], cb?) {
	logger.info('Executing ' + cmd + ' ' + options + ' locally');
	spawnProcess(cmd, host, options, cb);
}

/**
 * Fork child process to run command.
 *
 * @param {String} command
 * @param {Object} options
 * @param {Callback} callback
 *
 */
function spawnProcess(command: string, host: string, options: string[], cb) {
	var child = null;

	if (env === Constants.RESERVED.ENV_DEV) {
		child = cp.spawn(command, options);
		var prefix = command === Constants.COMMAND.SSH ? '[' + host + '] ' : '';

		child.stderr.on('data', function (chunk) {
			var msg = chunk.toString();
			process.stderr.write(msg);
			if (!!cb) {
				cb(msg);
			}
		});

		child.stdout.on('data', function (chunk) {
			var msg = prefix + chunk.toString();
			process.stdout.write(msg);
		});
	} else {
		child = cp.spawn(command, options, { detached: true, stdio: 'inherit' });
		child.unref();
	}

	child.on('exit', function (code) {
		if (code !== 0) {
			logger.warn('child process exit with error, error code: %s, executed command: %s', code, command);
		}
		if (typeof cb === 'function') {
			cb(code === 0 ? null : code);
		}
	});
}
