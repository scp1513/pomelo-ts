import fs = require('fs')
import path = require('path')
import async = require('async')
import pomelo = require('../pomelo')
import { Application } from '../application'
import log = require('./log')
import utils = require('./utils')
import Constants = require('./constants')
import starter = require('../master/starter')

let logger = require('pomelo-logger').getLogger('pomelo', __filename)

/**
 * Initialize application configuration.
 */
export function defaultConfiguration(app: Application) {
	var args = parseArgs(process.argv);
	setupEnv(app, args);
	loadMaster(app);
	loadServers(app);
	processArgs(app, args);
	configLogger(app);
	loadLifecycle(app);
}

/**
 * Start servers by type.
 */
export function startByType(app: Application, cb: () => void) {
	let startId = app.get<ServerId>(Constants.RESERVED.STARTID)
	if (!!startId) {
		if (startId === Constants.RESERVED.MASTER) {
			cb();
		} else {
			starter.runServers(app);
		}
	} else {
		let startType: ServerType = app.get<ServerType>(Constants.RESERVED.TYPE)
		if (!!startType && startType !== Constants.RESERVED.ALL && startType !== Constants.RESERVED.MASTER) {
			starter.runServers(app);
		} else {
			cb();
		}
	}
}

/**
 * Load default components for application.
 */
export function loadDefaultComponents(app: Application) {
	// load system default components
	if (app.serverType === Constants.RESERVED.MASTER) {
		app.load(pomelo.master, app.get('masterConfig'));
	} else {
		app.load(pomelo.proxy, app.get('proxyConfig'));
		if (app.getCurServer().port) {
			app.load(pomelo.remote, app.get('remoteConfig'));
		}
		if (app.isFrontend()) {
			app.load(pomelo.connection, app.get('connectionConfig'));
			app.load(pomelo.connector, app.get('connectorConfig'));
			app.load(pomelo.session, app.get('sessionConfig'));
			// compatible for schedulerConfig
			if (app.get('schedulerConfig')) {
				app.load(pomelo.pushScheduler, app.get('schedulerConfig'));
			} else {
				app.load(pomelo.pushScheduler, app.get('pushSchedulerConfig'));
			}
		}
		app.load(pomelo.backendSession, app.get('backendSessionConfig'));
		app.load(pomelo.channel, app.get('channelConfig'));
		app.load(pomelo.server, app.get('serverConfig'));
	}
	app.load(pomelo.monitor, app.get('monitorConfig'));
}

/**
 * Stop components.
 * @param comps component list
 * @param index current component index
 * @param force whether stop component immediately
 * @param cb
 */
export function stopComps(comps: IComponent[], index: number, force: boolean, cb: () => void) {
	if (index >= comps.length) {
		utils.invokeCallback(cb);
		return;
	}
	var comp = comps[index];
	if (typeof comp.stop === 'function') {
		comp.stop(force, function () {
			// ignore any error
			stopComps(comps, index + 1, force, cb);
		});
	} else {
		stopComps(comps, index + 1, force, cb);
	}
}

/**
 * Apply command to loaded components.
 * This method would invoke the component {method} in series.
 * Any component {method} return err, it would return err directly.
 * @param comps loaded component list
 * @param method component lifecycle method name, such as: start, stop
 * @param cb
 */
export function optComponents(comps: IComponent[], method: string, cb: Callback<void>) {
	async.forEachSeries(comps, (comp: AnyMap, done: Callback<void>) => {
		if (typeof comp[method] === 'function') {
			comp[method](done);
		} else {
			done();
		}
	}, (err) => {
		if (err) {
			if (typeof err === 'string') {
				logger.error('fail to operate component, method: %s, err: %s', method, err);
			} else {
				logger.error('fail to operate component, method: %s, err: %s', method, err.stack);
			}
		}
		utils.invokeCallback(cb, err);
	});
}

/**
 * Load server info from config/servers.json.
 */
function loadServers(app: Application) {
	app.loadConfigBaseApp(Constants.RESERVED.SERVERS, Constants.FILEPATH.SERVER);
	var servers = app.get<{[type: string]: IServerInfo[]}>(Constants.RESERVED.SERVERS);
	var serverMap: { [id: string]: IServerInfo } = {};
	for (var serverType in servers) {
		let slist = servers[serverType];
		for (let i = 0, l = slist.length; i < l; i++) {
			let server = slist[i];
			server.serverType = serverType;
			if (server.clusterCount) {
				utils.loadCluster(app, server, serverMap);
				continue;
			}
			serverMap[server.id] = server;
		}
	}
	app.set(Constants.KEYWORDS.SERVER_MAP, serverMap);
}

/**
 * Load master info from config/master.json.
 */
function loadMaster(app: Application) {
	app.loadConfigBaseApp(Constants.RESERVED.MASTER, Constants.FILEPATH.MASTER);
	app.master = app.get<IMasterInfo>(Constants.RESERVED.MASTER);
}

/**
 * Process server start command
 */
function processArgs(app: Application, args: { [key: string]: string | number | boolean }) {
	var serverType = args.serverType || Constants.RESERVED.MASTER;
	var serverId = args.id || app.getMaster().id;
	var mode = args.mode || Constants.RESERVED.CLUSTER;
	var masterha = args.masterha || false;
	var type = args.type || Constants.RESERVED.ALL;
	var startId = args.startId;

	app.set(Constants.RESERVED.MAIN, args.main, true);
	app.set(Constants.RESERVED.SERVER_TYPE, serverType, true);
	app.set(Constants.RESERVED.SERVER_ID, serverId, true);
	app.set(Constants.RESERVED.MODE, mode, true);
	app.set(Constants.RESERVED.TYPE, type, true);
	if (!!startId) {
		app.set(Constants.RESERVED.STARTID, startId);
	}

	if (masterha === true) {
		app.master = args;
		app.set(Constants.RESERVED.CURRENT_SERVER, args);
		app.curServer = args
	} else if (serverType !== Constants.RESERVED.MASTER) {
		app.set(Constants.RESERVED.CURRENT_SERVER, args);
		app.curServer = args
	} else {
		app.set(Constants.RESERVED.CURRENT_SERVER, app.getMaster());
		app.curServer = app.getMaster()
	}
}

/**
 * Setup enviroment.
 */
function setupEnv(app: Application, args: { [key: string]: string | number | boolean }) {
	app.set(Constants.RESERVED.ENV, args.env || process.env.NODE_ENV || Constants.RESERVED.ENV_DEV, true);
}

/**
 * Configure custom logger.
 */
function configLogger(app: Application) {
	if (process.env.POMELO_LOGGER !== 'off') {
		var env = app.get<string>(Constants.RESERVED.ENV);
		var originPath = path.join(app.getBase(), Constants.FILEPATH.LOG);
		var presentPath = path.join(app.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.LOG));
		if (fs.existsSync(originPath)) {
			log.configure(app, originPath);
		} else if (fs.existsSync(presentPath)) {
			log.configure(app, presentPath);
		} else {
			logger.error('logger file path configuration is error.');
		}
	}
}

/**
 * Parse command line arguments.
 *
 * @param args command line arguments
 *
 * @return Object argsMap map of arguments
 */
function parseArgs(args: string[]) {
	var argsMap: { [key: string]: string | number | boolean } = {};
	var mainPos = 1;

	while (args[mainPos].indexOf('--') > 0) {
		mainPos++;
	}
	argsMap.main = args[mainPos];

	for (var i = (mainPos + 1); i < args.length; i++) {
		var arg = args[i];
		var sep = arg.indexOf('=');
		var key = arg.slice(0, sep);
		var value: string | number | boolean = arg.slice(sep + 1);
		if (!isNaN(Number(value)) && (value.indexOf('.') < 0)) {
			value = Number(value);
		} else {
			let lower = value.toLowerCase()
			if (lower === 'true') {
				value = true
			} else if (lower === 'false') {
				value = false
			}
		}
		argsMap[key] = value;
	}

	return argsMap;
}

/**
 * Load lifecycle file.
 *
 */
function loadLifecycle(app: Application) {
	var filePath = path.join(app.getBase(), Constants.FILEPATH.SERVER_DIR, String(app.serverType), Constants.FILEPATH.LIFECYCLE);
	if (!fs.existsSync(filePath)) {
		return;
	}
	var lifecycle = require(filePath);
	for (var key in lifecycle) {
		if (typeof lifecycle[key] === 'function') {
			app.lifecycleCbs[key] = lifecycle[key];
		} else {
			logger.warn('lifecycle.js in %s is error format.', filePath);
		}
	}
}
