/**
 * Component for monitor.
 * Load and start monitor client.
 */
import admin = require('../../../pomelo-admin')
import { Application } from '../application'
import moduleUtil = require('../util/moduleUtil')
import utils = require('../util/utils')
import Constants = require('../util/constants')
var logger = require('pomelo-logger').getLogger('pomelo', __filename)

export class Monitor {
	app: Application
	serverInfo: IServerInfo
	masterInfo: IMasterInfo
	modules: any
	closeWatcher: boolean
	monitorConsole: admin.ConsoleService

	constructor(app: Application, opts?: IMonitorOpts) {
		opts = opts || {};
		this.app = app;
		this.serverInfo = app.getCurServer();
		this.masterInfo = app.getMaster();
		this.modules = [];
		this.closeWatcher = opts.closeWatcher;

		this.monitorConsole = admin.createMonitorConsole({
			id: this.serverInfo.id,
			type: this.app.getServerType(),
			host: this.masterInfo.host,
			port: this.masterInfo.port,
			info: this.serverInfo,
			env: this.app.get(Constants.RESERVED.ENV),
			authServer: app.get('adminAuthServerMonitor'), // auth server function
		});
	}

	start(cb: Callback<void>) {
		moduleUtil.registerDefaultModules(false, this.app, this.closeWatcher);
		this.startConsole(cb);
	}

	startConsole(cb: Callback<void>) {
		moduleUtil.loadModules(this, this.monitorConsole);

		var self = this;
		this.monitorConsole.start(function (err) {
			if (err) {
				utils.invokeCallback(cb, err);
				return;
			}
			moduleUtil.startModules(self.modules, function (err) {
				utils.invokeCallback(cb, err);
				return;
			});
		});

		this.monitorConsole.on('error', function (err: AnyErr) {
			if (!!err) {
				logger.error('monitorConsole encounters with error: %j', err.stack);
				return;
			}
		});
	}

	stop(cb: Callback<void>) {
		this.monitorConsole.stop();
		this.modules = [];
		process.nextTick(function () {
			utils.invokeCallback(cb);
		});
	}

	// monitor reconnect to master
	reconnect(masterInfo: IMasterInfo) {
		var self = this;
		this.stop(function () {
			self.monitorConsole = admin.createMonitorConsole({
				id: self.serverInfo.id,
				type: self.app.getServerType(),
				host: masterInfo.host,
				port: masterInfo.port,
				info: self.serverInfo,
				env: self.app.get(Constants.RESERVED.ENV)
			});
			self.startConsole(function () {
				logger.info('restart modules for server : %j finish.', self.app.serverId);
			});
		});
	}
}