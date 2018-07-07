import fs = require('fs');
import Loader = require('../../../../pomelo-loader');
import utils = require('../../util/utils');
import pathUtil = require('../../util/pathUtil');
import { Application } from '../../application';
import { FrontendSession } from './sessionService';
import { BackendSession } from './backendSessionService';

var logger = require('pomelo-logger').getLogger('pomelo', __filename);
var forwardLogger = require('pomelo-logger').getLogger('forward-log', __filename);

type HandlerMap = {[serverType: string]: {[handler: string]: {[method: string]: IHandler}}}

/**
 * Handler service.
 * Dispatch request to the relactive handler.
 *
 * @param {Object} app      current application context
 */
export class HandlerService {
	app: Application
	handlerMap: HandlerMap
	enableForwardLog: boolean

	constructor(app: Application, opts: IHandlerServiceOpts) {
		this.app = app;
		this.handlerMap = {};
		if (!!opts.reloadHandlers) {
			this.watchHandlers(app, this.handlerMap);
		}

		this.enableForwardLog = opts.enableForwardLog || false;
	}

	/**
	 * Handler the request.
	 */
	handle(routeRecord: IRouteRec, msg: IBackendMessage, session: FrontendSession|BackendSession, cb: (err: AnyErr, resp?: IRespMessage, opts?: AnyMap) => void) {
		// the request should be processed by current server
		let handler = this.getHandler(routeRecord);
		if (!handler) {
			logger.error('[handleManager]: fail to find handler for %j', msg.__route__);
			cb(new Error('fail to find handler for ' + msg.__route__));
			return;
		}
		let start = Date.now();
		handler[routeRecord.method](msg, session, (err: AnyErr, resp: IRespMessage, opts: AnyMap) => {
			if (this.enableForwardLog) {
				let log = {
					route: msg.__route__,
					args: msg,
					time: utils.format(new Date(start)),
					timeUsed: Date.now() - start
				};
				forwardLogger.info(JSON.stringify(log));
			}

			cb(err, resp, opts);
		});
	}

	/**
	 * Get handler instance by routeRecord.
	 *
	 * @param  handlers    handler map
	 * @param  routeRecord route record parsed from route string
	 * @return             handler instance if any matchs or null for match fail
	 */
	private getHandler(routeRecord: IRouteRec) {
		let serverType = routeRecord.serverType;
		if (!this.handlerMap[serverType]) {
			this.loadHandlers(this.app, serverType, this.handlerMap);
		}
		let handlers = this.handlerMap[serverType] || {};
		let handler = handlers[routeRecord.handler];
		if (!handler) {
			logger.warn('could not find handler for routeRecord: %j', routeRecord);
			return null;
		}
		if (typeof handler[routeRecord.method] !== 'function') {
			logger.warn('could not find the method %s in handler: %s', routeRecord.method, routeRecord.handler);
			return null;
		}
		return handler;
	}

	/**
	 * Load handlers from current application
	 */
	private loadHandlers(app: Application, serverType: ServerType, handlerMap: HandlerMap) {
		var p = pathUtil.getHandlerPath(app.getBase(), serverType);
		if (p) {
			handlerMap[serverType] = Loader.load(p, 'Handler', app);
		}
	}

	private watchHandlers(app: Application, handlerMap: HandlerMap) {
		var p = pathUtil.getHandlerPath(app.getBase(), app.serverType);
		if (!!p) {
			fs.watch(p, (event, name) => {
				if (event === 'change') {
					handlerMap[app.serverType] = Loader.load(p, 'Handler', app);
				}
			});
		}
	}

}
