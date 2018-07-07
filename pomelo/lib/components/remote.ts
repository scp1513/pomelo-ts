/**
 * Component for remote service.
 * Load remote service and add to global context.
 */
import fs = require('fs');
import pathUtil = require('../util/pathUtil');
import PomeloRpc = require('pomelo-rpc');
import { Application } from '../application';
import RemoteServer = PomeloRpc.server

/**
 * Remote component class
 *
 * @param {Object} app  current application context
 * @param {Object} opts construct parameters
 */
export class Component implements IComponent {
	static _name = '__remote__'

	app: Application
	opts
	remote

	/**
	 * constructor
	 * @param app  current application context
	 * @param opts construct parameters
	 *             opts.acceptorFactory {Object}: acceptorFactory.create(opts, cb)
	 */
	constructor(app: Application, opts) {
		opts = opts || {};
	
		// cacheMsg is deprecated, just for compatibility here.
		opts.bufferMsg = opts.bufferMsg || opts.cacheMsg || false;
		opts.interval = opts.interval || 30;
		if (app.enabled('rpcDebugLog')) {
			opts.rpcDebugLog = true;
			opts.rpcLogger = require('pomelo-logger').getLogger('rpc-debug', __filename);
		}

		this.app = app;
		this.opts = opts;
	}

	/**
	 * Remote component lifecycle function
	 * @param  cb
	 */
	start(cb: Callback<void>) {
		this.opts.port = this.app.getCurServer().port;
		this.remote = this.genRemote(this.app, this.opts);
		this.remote.start();
		process.nextTick(cb);
	}

	/**
	 * Remote component lifecycle function
	 * @param  force whether stop the component immediately
	 * @param  cb
	 */
	stop(force: boolean, cb: Callback<void>) {
		this.remote.stop(force);
		process.nextTick(cb);
	}

	/**
	 * Get remote paths from application
	 * @param  app current application context
	 */
	private getRemotePaths(app: Application) {
		var paths = [];

		// master server should not come here
		var role = app.isFrontend() ? 'frontend' : 'backend';

		var sysPath = pathUtil.getSysRemotePath(role), serverType = app.getServerType();
		if (fs.existsSync(sysPath)) {
			paths.push(pathUtil.remotePathRecord('sys', serverType, sysPath));
		}
		var userPath = pathUtil.getUserRemotePath(app.getBase(), serverType);
		if (fs.existsSync(userPath)) {
			paths.push(pathUtil.remotePathRecord('user', serverType, userPath));
		}

		return paths;
	}

	/**
	 * Generate remote server instance
	 *
	 * @param {Object} app current application context
	 * @param {Object} opts contructor parameters for rpc Server
	 * @return {Object} remote server instance
	 */
	private genRemote(app: Application, opts) {
		opts.paths = this.getRemotePaths(app);
		opts.context = app;
		if (!!opts.rpcServer) {
			return opts.rpcServer.create(opts);
		} else {
			return RemoteServer.create(opts);
		}
	}

}
