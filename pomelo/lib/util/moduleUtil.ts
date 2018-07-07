import os = require('os');
import admin = require('../../../pomelo-admin');
import utils = require('./utils');
import Constants = require('./constants');
import pathUtil = require('./pathUtil');
import { Application } from '../application';

interface IModulesLoader{
	app: Application
	modules: IModule[]
}

/**
 * Load admin modules
 */
export function loadModules(self: IModulesLoader, consoleService: admin.ConsoleService) {
	// load app register modules
	var _modules = self.app.get<{ [id: string]: IModuleInfo }>(Constants.KEYWORDS.MODULE);

	if (!_modules) {
		return;
	}

	for (var id in _modules) {
		let record = _modules[id];
		let _module = new record.module(record.opts, consoleService);

		consoleService.register(record.moduleId, _module);
		self.modules.push(_module);
	}
}

export function startModules(modules: IModule[], cb: Callback<void>) {
	// invoke the start lifecycle method of modules
	if (!modules) {
		return;
	}
	startModule(null, modules, 0, cb);
}

/**
 * Append the default system admin modules
 */
export function registerDefaultModules(isMaster: boolean, app: Application, closeWatcher: boolean) {
	if (!closeWatcher) {
		if (isMaster) {
			app.registerAdmin(require('../modules/masterwatcher').Module, { app });
		} else {
			app.registerAdmin(require('../modules/monitorwatcher').Module, { app });
		}
	}
	app.registerAdmin(admin.modules.watchServer, { app });
	app.registerAdmin(require('../modules/console').Module, { app });
	if (app.enabled('systemMonitor')) {
		if (os.platform() !== Constants.PLATFORM.WIN) {
			app.registerAdmin(admin.modules.systemInfo);
			app.registerAdmin(admin.modules.nodeInfo);
		}
		app.registerAdmin(admin.modules.monitorLog, { path: pathUtil.getLogPath(app.getBase()) });
		app.registerAdmin(admin.modules.scripts, { app, path: pathUtil.getScriptPath(app.getBase()) });
		if (os.platform() !== Constants.PLATFORM.WIN) {
			app.registerAdmin(admin.modules.profiler);
		}
	}
}

function startModule(err: AnyErr, modules: IModule[], index: number, cb: Callback<void>) {
	if (err || index >= modules.length) {
		utils.invokeCallback(cb, err);
		return;
	}

	let _module = modules[index];
	if (_module && typeof _module.start === 'function') {
		_module.start((err) => {
			startModule(err, modules, index + 1, cb);
		});
	} else {
		startModule(err, modules, index + 1, cb);
	}
}
