/**
 * Implementation of server component.
 * Init and start server instance.
 */
import fs = require('fs')
import path = require('path')
import util = require('util')
import Loader = require('../../../pomelo-loader');
import schedule = require('pomelo-scheduler');
import { Application } from '../application';
import pathUtil = require('../util/pathUtil');
import events = require('../util/events');
import Constants = require('../util/constants');
import { FilterService } from '../common/service/filterService';
import { HandlerService } from '../common/service/handlerService';
import { FrontendSession } from '../common/service/sessionService';
import { BackendSession } from '../common/service/backendSessionService';

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

var ST_INITED = 0;    // server inited
var ST_STARTED = 1;   // server started
var ST_STOPED = 2;    // server stoped

export class Server {
	app: Application
	opts: IHandlerServiceOpts
	globalFilterService: FilterService = null
	filterService: FilterService = null
	handlerService: HandlerService = null
	crons: ICronInfo[] = []
	state = ST_INITED
	jobs: any
	cronHandlers: any

	constructor(app: Application, opts: IHandlerServiceOpts) {
		this.opts = opts || {};
		this.app = app;
		this.jobs = {};

		app.event.on(events.ADD_CRONS, (crons: ICronInfo[]) => this.addCrons(crons));
		app.event.on(events.REMOVE_CRONS, (crons: ICronInfo[]) => this.removeCrons(crons));
	}

	/**
	 * Server lifecycle callback
	 */
	start() {
		if (this.state > ST_INITED) {
			return;
		}

		this.globalFilterService = this.initFilter(true);
		this.filterService = this.initFilter(false);
		this.handlerService = this.initHandler();
		this.cronHandlers = this.loadCronHandlers();
		this.loadCrons();
		this.state = ST_STARTED;
	}

	afterStart() {
		this.scheduleCrons(this.crons);
	}

	/**
	 * Stop server
	 */
	stop() {
		this.state = ST_STOPED;
	}

	/**
	 * Global handler.
	 * @param  msg request message
	 * @param  session session object
	 * @param  callback function 
	 */
	globalHandle(msg: IMessage, session: FrontendSession, cb: HandlerCb) {
		if (this.state !== ST_STARTED) {
			cb(new Error('server not started'));
			return;
		}

		let routeRecord = this.parseRoute(msg.route);
		if (!routeRecord) {
			cb(new Error(util.format('meet unknown route message %j', msg.route)));
			return;
		}

		this.beforeFilter(true, msg, session, (err, resp, opts) => {
			if (err) {
				this.handleError(true, err, msg, session, resp, opts, (err, resp, opts) => {
					this.response(true, err, msg, session, resp, opts, cb);
				});
				return;
			}

			if (this.app.getServerType() !== routeRecord.serverType) {
				this.doForward(this.app, msg, session, routeRecord, (err, resp?, opts?) => {
					this.response(true, err, msg, session, resp, opts, cb);
				});
			} else {
				this.doHandle(msg, session, routeRecord, (err, resp, opts) => {
					this.response(true, err, msg, session, resp, opts, cb);
				});
			}
		});
	}

	/**
	 * Handle request
	 */
	handle(msg: IMessage, session: BackendSession, cb: HandlerCb) {
		if (this.state !== ST_STARTED) {
			cb(new Error('server not started'));
			return;
		}

		var routeRecord = this.parseRoute(msg.route);
		this.doHandle(msg, session, routeRecord, cb);
	}

	/**
	 * Add crons at runtime.
	 * @param {Array} crons would be added in application
	 */
	addCrons(crons: ICronInfo[]) {
		this.cronHandlers = this.loadCronHandlers();
		for (var i = 0, l = crons.length; i < l; i++) {
			var cron = crons[i];
			this.checkAndAdd(cron);
		}
		this.scheduleCrons(crons);
	}

	/**
	 * Remove crons at runtime.
	 *
	 * @param {Array} crons would be removed in application
	 */
	removeCrons(crons: ICronInfo[]) {
		for (var i = 0, l = crons.length; i < l; i++) {
			var cron = crons[i];
			var id = cron.id;
			if (!!this.jobs[id]) {
				schedule.cancelJob(this.jobs[id]);
			} else {
				logger.warn('cron is not in application: %j', cron);
			}
		}
	}

	private initFilter(isGlobal: boolean) {
		var service = new FilterService();
		var befores: IFilter[], afters: IFilter[];

		if (isGlobal) {
			befores = this.app.get(Constants.KEYWORDS.GLOBAL_BEFORE_FILTER);
			afters = this.app.get(Constants.KEYWORDS.GLOBAL_AFTER_FILTER);
		} else {
			befores = this.app.get(Constants.KEYWORDS.BEFORE_FILTER);
			afters = this.app.get(Constants.KEYWORDS.AFTER_FILTER);
		}

		if (befores) {
			for (let i = 0, l = befores.length; i < l; i++) {
				service.before(befores[i]);
			}
		}

		if (afters) {
			for (let i = 0, l = afters.length; i < l; i++) {
				service.after(afters[i]);
			}
		}

		return service;
	}

	private initHandler() {
		return new HandlerService(this.app, this.opts);
	}

	/**
	 * Load cron handlers from current application
	 */
	private loadCronHandlers() {
		var p = pathUtil.getCronPath(this.app.getBase(), this.app.getServerType());
		if (p) {
			return Loader.load(p, 'Cron', this.app);
		}
		return null;
	}

	/**
	 * Load crons from configure file
	 */
	private loadCrons() {
		var env = this.app.get<string>(Constants.RESERVED.ENV);
		var p = path.join(this.app.getBase(), Constants.FILEPATH.CRON);
		if (!fs.existsSync(p)) {
			p = path.join(this.app.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.CRON));
			if (!fs.existsSync(p)) {
				return;
			}
		}
		this.app.loadConfigBaseApp(Constants.RESERVED.CRONS, Constants.FILEPATH.CRON);
		var crons = this.app.get<{ [serverType: string]: ICronInfo[] }>(Constants.RESERVED.CRONS);
		for (var serverType in crons) {
			if (this.app.serverType === serverType) {
				var list = crons[serverType];
				for (var i = 0; i < list.length; i++) {
					if (!list[i].serverId) {
						this.checkAndAdd(list[i]);
					} else {
						if (this.app.serverId === list[i].serverId) {
							this.checkAndAdd(list[i]);
						}
					}
				}
			}
		}
	}

	/**
	 * Fire before filter chain if any
	 */
	private beforeFilter(isGlobal: boolean, msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, cb: HandlerCb) {
		var fm;
		if (isGlobal) {
			fm = this.globalFilterService;
		} else {
			fm = this.filterService;
		}
		if (fm) {
			fm.beforeFilter(msg, session, cb);
		} else {
			cb(null);
		}
	}

	/**
	 * Fire after filter chain if have
	 */
	private afterFilter(isGlobal: boolean, err: AnyErr, msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, resp: IRespMessage, opts: AnyMap, cb: HandlerCb) {
		let fm: FilterService;
		if (isGlobal) {
			fm = this.globalFilterService;
		} else {
			fm = this.filterService;
		}
		if (fm) {
			if (isGlobal) {
				fm.afterFilter(err, msg, session, resp, function () {
					// do nothing
				});
			} else {
				fm.afterFilter(err, msg, session, resp, function (err) {
					cb(err, resp, opts);
				});
			}
		}
	}

	/**
	 * pass err to the global error handler if specified
	 */
	private handleError(isGlobal: boolean, err: AnyErr, msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, resp: IRespMessage, opts: AnyMap, cb: HandlerCb) {
		var handler: ErrorHandler;
		if (isGlobal) {
			handler = this.app.get<ErrorHandler>(Constants.RESERVED.GLOBAL_ERROR_HANDLER);
		} else {
			handler = this.app.get<ErrorHandler>(Constants.RESERVED.ERROR_HANDLER);
		}
		if (!handler) {
			logger.debug('no default error handler to resolve unknown exception. ' + err.stack);
			cb(err, resp, opts);
		} else {
			handler(err, msg, resp, session, opts, cb);
		}
	}

	/**
	 * Send response to client and fire after filter chain if any.
	 */
	private response(isGlobal: boolean, err: AnyErr, msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, resp: IRespMessage, opts: AnyMap, cb: HandlerCb) {
		if (isGlobal) {
			cb(err, resp, opts);
			// after filter should not interfere response
			this.afterFilter(isGlobal, err, msg, session, resp, opts, cb);
		} else {
			this.afterFilter(isGlobal, err, msg, session, resp, opts, cb);
		}
	}

	/**
	 * Parse route string.
	 *
	 * @param  route route string, such as: serverName.handlerName.methodName
	 * @return parse result object or null for illeagle route string
	 */
	private parseRoute(route: string): IRouteRec {
		if (!route) {
			return null;
		}
		let ts = route.split('.');
		if (ts.length !== 3) {
			return null;
		}

		return {
			route: route,
			serverType: ts[0],
			handler: ts[1],
			method: ts[2]
		};
	}

	private doForward(app: Application, msg: IMessage, session: FrontendSession, routeRecord: IRouteRec, cb: HandlerCb) {
		var finished = false;
		//should route to other servers
		try {
			app.sysrpc[routeRecord.serverType].msgRemote.forwardMessage(
				session,
				msg,
				session.export(),
				function (err, resp, opts) {
					if (err) {
						logger.error('fail to process remote message:' + err.stack);
					}
					finished = true;
					cb(err, resp, opts);
				}
			);
		} catch (err) {
			if (!finished) {
				logger.error('fail to forward message:' + err.stack);
				cb(err);
			}
		}
	}

	private doHandle(originMsg: IMessage, session: FrontendSession|BackendSession, routeRecord: IRouteRec, cb: HandlerCb) {
		let msg = <IBackendMessage>originMsg.body
		if (!msg) {
			msg = {__route__: originMsg.route }
		} else {
			msg.__route__ = originMsg.route
		}

		this.beforeFilter(false, msg, session, (err, resp, opts) => {
			if (err) {
				// error from before filter
				this.handleError(false, err, msg, session, resp, opts, (err, resp, opts) => {
					this.response(false, err, msg, session, resp, opts, cb);
				});
				return;
			}

			this.handlerService.handle(routeRecord, msg, session, (err, resp, opts) => {
				if (err) {
					//error from handler
					this.handleError(false, err, msg, session, resp, opts, (err, resp, opts) => {
						this.response(false, err, msg, session, resp, opts, cb);
					});
					return;
				}

				this.response(false, err, msg, session, resp, opts, cb);
			});
		});
	}

	/**
	 * Schedule crons
	 */
	private scheduleCrons(crons: ICronInfo[]) {
		let handlers = this.cronHandlers;
		for (let i = 0; i < crons.length; i++) {
			let cronInfo = crons[i];
			let time = cronInfo.time;
			let action = cronInfo.action;
			let jobId = cronInfo.id;

			if (!time || !action || !jobId) {
				logger.error('cron miss necessary parameters: %j', cronInfo);
				continue;
			}

			if (action.indexOf('.') < 0) {
				logger.error('cron action is error format: %j', cronInfo);
				continue;
			}

			let cron = action.split('.')[0];
			let job = action.split('.')[1];
			let handler = handlers[cron];

			if (!handler) {
				logger.error('could not find cron: %j', cronInfo);
				continue;
			}

			if (typeof handler[job] !== 'function') {
				logger.error('could not find cron job: %j, %s', cronInfo, job);
				continue;
			}

			let id = schedule.scheduleJob(time, handler[job].bind(handler));
			this.jobs[jobId] = id;
		}
	}

	/**
	 * If cron is not in crons then put it in the array.
	 */
	private checkAndAdd(cron: ICronInfo) {
		if (!this.containCron(cron.id)) {
			this.crons.push(cron);
		} else {
			logger.warn('cron is duplicated: %j', cron);
		}
	}

	/**
	 * Check if cron is in crons.
	 */
	private containCron(id: number) {
		for (let i = 0, l = this.crons.length; i < l; i++) {
			if (id === this.crons[i].id) {
				return true;
			}
		}
		return false;
	}
}