import fs = require('fs')
import path = require('path')
import util = require('util')
import { EventEmitter } from "events"

import utils = require('./util/utils');
import events = require('./util/events');
import appUtil = require('./util/appUtil');
import Constants = require('./util/constants');

let logger = require('pomelo-logger').getLogger('pomelo', __filename);

type HookFunc = (app: Application, shutdown: () => void, cancelShutDownTimer: () => void) => void

/**
 * Application states
 */
const STATE_INITED = 1; // app has inited
const STATE_START = 2; // app start
const STATE_STARTED = 3; // app has started
const STATE_STOPED = 4; // app has stoped

export class Application implements IApplication {
	/**event object to sub/pub events */
	event: EventEmitter = null

	/**app base path */
	private base: string = null

	/**current server id */
	serverId: ServerId = null
	/**current server type */
	serverType: ServerType = null
	/**current server info */
	curServer: IServerInfo = null
	/**current server start time */
	startTime: number = null

	/**master server info */
	master: IMasterInfo = null
	/**current global server info maps, id -> info */
	servers: { [id: string]: IServerInfo } = null
	/**current global type maps, type -> [info] */
	serverTypeMaps: { [type: string]: IServerInfo[] } = null
	/**current global server type list */
	serverTypes: ServerType[] = null
	/**current server custom lifecycle callbacks */
	lifecycleCbs: { [name: string]: LifecycleHandler } = null
	/**cluster id seqence */
	clusterSeq: { [serverType: string]: number } = null

	/**loaded component list */
	loaded: IComponent[] = null
	/**name -> component map */
	components: { [name: string]: IComponent } = null
	/**collection keep set/get */
	settings: { [name: string]: any } = null

	/**Application states */
	state: number = null

	stopTimer: NodeJS.Timer = null

	// getter
	rpcInvoke: <T>(sid: ServerId, d: { namespace: string, service: string, method: string, args: any[] }, cb: Callback<T>) => void
	rpc: any
	sysrpc: any

	init(opts?: IApplicationOpts) {
		opts = opts || {};
		this.loaded = [];
		this.components = {};
		this.settings = {};
		let base = opts.base || path.dirname(require.main.filename);
		this.set(Constants.RESERVED.BASE, base);
		this.base = base;
		this.event = new EventEmitter();

		this.servers = {};
		this.serverTypeMaps = {};
		this.serverTypes = [];
		this.lifecycleCbs = {};
		this.clusterSeq = {};

		appUtil.defaultConfiguration(this);

		this.state = STATE_INITED;
		logger.info('application inited: %j', this.getServerId());
	}

	/**
	 * Get application base path
	 */
	getBase() {
		return this.base;
	}

	/**
	 * Override require method in application
	 * @param ph path of file
	 */
	require(ph: string) {
		return require(path.join(this.getBase(), ph));
	}

	/**
	 * Configure logger with {$base}/config/log4js.json
	 * @param logger pomelo-logger instance without configuration
	 */
	configureLogger(logger) {
		if (process.env.POMELO_LOGGER !== 'off') {
			let base = this.getBase();
			let env = this.get<string>(Constants.RESERVED.ENV);
			let originPath = path.join(base, Constants.FILEPATH.LOG);
			let presentPath = path.join(base, Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.LOG));
			if (fs.existsSync(originPath)) {
				logger.configure(originPath, { serverId: this.serverId, base: base });
			} else if (fs.existsSync(presentPath)) {
				logger.configure(presentPath, { serverId: this.serverId, base: base });
			} else {
				logger.error('logger file path configuration is error.');
			}
		}
	}

	/**
	 * add a filter to before and after filter
	 * @param filter provide before and after filter method.
	 *               A filter should have two methods: before and after.
	 */
	filter(filter: IFilter) {
		this.before(filter);
		this.after(filter);
	}

	/**
	 * Add before filter.
	 * @param bf before fileter, bf(msg, session, next)
	 */
	before(bf: IFilter) {
		this.addFilter(Constants.KEYWORDS.BEFORE_FILTER, bf);
	}

	/**
	 * Add after filter.
	 * @param af after filter, `af(err, msg, session, resp, next)`
	 */
	after(af: IFilter) {
		this.addFilter(Constants.KEYWORDS.AFTER_FILTER, af);
	}

	/**
	 * add a global filter to before and after global filter
	 * @param filter provide before and after filter method.
	 *               A filter should have two methods: before and after.
	 */
	globalFilter(filter: IFilter) {
		this.globalBefore(filter);
		this.globalAfter(filter);
	}

	/**
	 * Add global before filter.
	 * @param bf before fileter, bf(msg, session, next)
	 */
	globalBefore(bf: IFilter) {
		this.addFilter(Constants.KEYWORDS.GLOBAL_BEFORE_FILTER, bf);
	}

	/**
	 * Add global after filter.
	 * @param af after filter, `af(err, msg, session, resp, next)`
	 */
	globalAfter(af: IFilter) {
		this.addFilter(Constants.KEYWORDS.GLOBAL_AFTER_FILTER, af);
	}

	/**
	 * Add rpc before filter.
	 * @param bf before fileter, bf(serverId, msg, opts, next)
	 */
	rpcBefore(bf: IFilter) {
		this.addFilter(Constants.KEYWORDS.RPC_BEFORE_FILTER, bf);
	}

	/**
	 * Add rpc after filter.
	 * @param af after filter, `af(serverId, msg, opts, next)`
	 */
	rpcAfter(af: IFilter) {
		this.addFilter(Constants.KEYWORDS.RPC_AFTER_FILTER, af);
	}

	/**
	 * add a rpc filter to before and after rpc filter
	 * @param filter provide before and after filter method.
	 *               A filter should have two methods: before and after.
	 */
	rpcFilter(filter: IFilter) {
		this.rpcBefore(filter);
		this.rpcAfter(filter);
	}




	/**
	 * Load component
	 *
	 * @param  component component instance or factory function of the component
	 * @param  opts      (optional) construct parameters for the factory function
	 * @return app instance for chain invoke
	 */
	load(component: IComponent | IComponentConstructor, opts?: any): this {
		let name: string;
		if (typeof component === 'function') {
			name = component._name;
			component = new component(this, opts);
		}

		if (name && this.components[name]) {
			// ignore duplicat component
			logger.warn('ignore duplicate component: %j', name);
			return null;
		}

		this.loaded.push(component);
		if (name) {
			// components with a name would get by name throught app.components later.
			this.components[name] = component;
		}

		return this;
	}

	/**
	 * Load Configure json file to settings.(support different enviroment directory & compatible for old path)
	 *
	 * @param key environment key
	 * @param val environment value
	 * @param reload whether reload after change default false
	 */
	loadConfigBaseApp(key: string, val: string, reload?: boolean) {
		let env = this.get<string>(Constants.RESERVED.ENV);
		let originPath = path.join(this.getBase(), val);
		let presentPath = path.join(this.getBase(), Constants.FILEPATH.CONFIG_DIR, env, path.basename(val));
		let realPath: string
		if (fs.existsSync(originPath)) {
			realPath = originPath;
			let file = require(originPath);
			if (file[env]) {
				file = file[env];
			}
			this.set(key, file);
		} else if (fs.existsSync(presentPath)) {
			realPath = presentPath;
			let pfile = require(presentPath);
			this.set(key, pfile);
		} else {
			logger.error('invalid configuration with file path: %s', key);
		}

		if (!!realPath && !!reload) {
			fs.watch(realPath, (event, filename) => {
				if (event === 'change') {
					delete require.cache[require.resolve(realPath)];
					this.loadConfigBaseApp(key, val);
				}
			});
		}
	}

	/**
	 * Load Configure json file to settings.
	 * @param key environment key
	 * @param val environment value
	 */
	loadConfig(key: string, val: string) {
		let env = this.get<string>(Constants.RESERVED.ENV);
		let obj = require(val);
		if (obj[env]) {
			obj = obj[env];
		}
		this.set(key, obj);
	}

	/**
	 * Set the route function for the specified server type.
	 *
	 * Examples:
	 *
	 *  app.route('area', routeFunc);
	 *
	 *  let routeFunc = function(session, msg, app, cb) {
	 *    // all request to area would be route to the first area server
	 *    let areas = app.getServersByType('area');
	 *    cb(null, areas[0].id);
	 *  };
	 *
	 * @param serverType server type string
	 * @param routeFunc  route function. routeFunc(session, msg, app, cb)
	 * @return current application instance for chain invoking
	 */
	route(serverType: ServerType, routeFunc: RouteFunc): this {
		let routes = this.get<RouteMap>(Constants.KEYWORDS.ROUTE);
		if (!routes) {
			routes = {};
			this.set(Constants.KEYWORDS.ROUTE, routes);
		}
		routes[serverType] = routeFunc;
		return this;
	}

	/**
	 * Set before stop function. It would perform before servers stop.
	 * @param fun before close function
	 */
	beforeStopHook(fun: HookFunc) {
		logger.warn('this method was deprecated in pomelo 0.8');
		if (!!fun && typeof fun === 'function') {
			this.set(Constants.KEYWORDS.BEFORE_STOP_HOOK, fun);
		}
	}

	/**
	 * Start application. It would load the default components and start all the loaded components.
	 *
	 * @param  {Function} cb callback function
	 * @memberOf Application
	 */
	start(cb?: Callback<void>) {
		if (!cb) cb = () => { }
		this.startTime = Date.now();
		if (this.state > STATE_INITED) {
			utils.invokeCallback(cb, new Error('application has already start.'));
			return;
		}

		appUtil.startByType(this, () => {
			appUtil.loadDefaultComponents(this)
			let startUp = () => {
				appUtil.optComponents(this.loaded, Constants.RESERVED.START, (err) => {
					this.state = STATE_START;
					if (err) {
						utils.invokeCallback(cb, err);
					} else {
						logger.info('%j enter after start...', this.getServerId());
						this.afterStart(cb);
					}
				});
			};
			let beforeFun = <BeforeStartupHandler>this.lifecycleCbs[Constants.LIFECYCLE.BEFORE_STARTUP];
			if (!!beforeFun) {
				beforeFun(this, startUp)
			} else {
				startUp();
			}
		});
	}

	/**
	 * Lifecycle callback for after start.
	 * @param cb callback function
	 */
	afterStart(cb: Callback<void>) {
		if (this.state !== STATE_START) {
			utils.invokeCallback(cb, new Error('application is not running now.'));
			return;
		}

		let afterFun = <AfterStartupHandler>this.lifecycleCbs[Constants.LIFECYCLE.AFTER_STARTUP];
		appUtil.optComponents(this.loaded, Constants.RESERVED.AFTER_START, (err) => {
			this.state = STATE_STARTED;
			let id = this.getServerId();
			if (!err) {
				logger.info('%j finish start', id);
			}
			if (!!afterFun) {
				afterFun(this, () => {
					utils.invokeCallback(cb, err);
				});
			} else {
				utils.invokeCallback(cb, err);
			}
			let usedTime = Date.now() - this.startTime;
			logger.info('%j startup in %d ms', id, usedTime);
			this.event.emit(events.START_SERVER, id);
		});
	}

	/**
	 * Stop components.
	 * @param force whether stop the app immediately
	 */
	stop(force: boolean) {
		if (this.state > STATE_STARTED) {
			logger.warn('[pomelo application] application is not running now.');
			return;
		}
		this.state = STATE_STOPED;

		this.stopTimer = setTimeout(() => {
			process.exit(0);
		}, Constants.TIME.TIME_WAIT_STOP);

		let cancelShutDownTimer = () => {
			if (!!this.stopTimer) {
				clearTimeout(this.stopTimer);
			}
		};
		let shutDown = () => {
			appUtil.stopComps(this.loaded, 0, force, () => {
				cancelShutDownTimer();
				if (force) {
					process.exit(0);
				}
			});
		};
		let fun = this.get<HookFunc>(Constants.KEYWORDS.BEFORE_STOP_HOOK);
		let stopFun = <StopHandler>this.lifecycleCbs[Constants.LIFECYCLE.BEFORE_SHUTDOWN];
		if (!!stopFun) {
			stopFun(this, shutDown, cancelShutDownTimer);
		} else if (!!fun) {
			fun(this, shutDown, cancelShutDownTimer);
		} else {
			shutDown();
		}
	}

	/**
	 * Assign `setting` to `val`, or return `setting`'s value.
	 * @param setting the setting of application
	 * @param val the setting's value
	 * @param attach whether attach the settings to application
	 * @return for chaining
	 */
	set<T>(setting: string | number, val: T, attach?: boolean): this {
		this.settings[setting] = val;
		if (attach) {
			this[setting] = val;
		}
		return this;
	}

	/**
	 * Get property from setting
	 * @param setting application setting
	 * @return val
	 */
	get<T>(setting: string | number): T {
		return this.settings[setting];
	}

	/**
	 * Check if `setting` is enabled.
	 * @param setting application setting
	 * @return enabled or not
	 */
	enabled(setting: string | number): boolean {
		return !!this.get(setting);
	}

	/**
	 * Check if `setting` is disabled.
	 * @param setting application setting
	 * @return disabled or not
	 */
	disabled(setting: string | number): boolean {
		return !this.get(setting);
	}

	/**
	 * Enable `setting`.
	 * @param {String} setting application setting
	 * @return {app} for chaining
	 */
	enable(setting: string | number): this {
		return this.set(setting, true);
	}

	/**
	 * Disable `setting`.
	 * @param setting application setting
	 * @return for chaining
	 */
	disable(setting: string | number): this {
		return this.set(setting, false);
	}

	/**
	 * Configure callback for the specified env and server type.
	 * When no env is specified that callback will
	 * be invoked for all environments and when no type is specified
	 * that callback will be invoked for all server types.
	 *
	 * Examples:
	 *
	 *  app.configure(function(){
	 *    // executed for all envs and server types
	 *  });
	 *
	 *  app.configure('development', function(){
	 *    // executed development env
	 *  });
	 *
	 *  app.configure('development', 'connector', function(){
	 *    // executed for development env and connector server type
	 *  });
	 *
	 * @param env application environment
	 * @param fn callback function
	 * @param type server type
	 * @return for chaining
	 */
	configure(env: string, type: string, fn: (app: Application) => void): this {
		let args = [].slice.call(arguments);
		fn = args.pop();
		env = type = Constants.RESERVED.ALL;

		if (args.length > 0) {
			env = args[0];
		}
		if (args.length > 1) {
			type = args[1];
		}

		if (env === Constants.RESERVED.ALL || this.contains(this.settings.env, env)) {
			if (type === Constants.RESERVED.ALL || this.contains(this.settings.serverType, type)) {
				fn(this);
			}
		}
		return this;
	}

	/**
	 * Register admin modules. Admin modules is the extends point of the monitor system.
	 * @param _module module object or factory function for module
	 * @param opts construct parameter for module
	 */
	registerAdmin(_module: IModuleConstructor, opts?: any) {
		let moduleId = _module.moduleId;
		if (!moduleId) {
			return;
		}

		let modules = this.get<{ [id: string]: IModuleInfo }>(Constants.KEYWORDS.MODULE);
		if (!modules) {
			modules = {};
			this.set(Constants.KEYWORDS.MODULE, modules);
		}

		modules[moduleId] = {
			moduleId: moduleId,
			module: _module,
			opts: opts
		};
	}

	/**
	 * Use plugin.
	 * @param plugin plugin instance
	 * @param opts   (optional) construct parameters for the factory function
	 */
	use(plugin, opts?: { [name: string]: AnyOpts }) {
		if (!plugin.components) {
			logger.error('invalid components, no components exist');
			return;
		}

		var self = this;
		opts = opts || {};
		var dir = path.dirname(plugin.components);

		if (!fs.existsSync(plugin.components)) {
			logger.error('fail to find components, find path: %s', plugin.components);
			return;
		}

		fs.readdirSync(plugin.components).forEach(function (filename) {
			if (!/\.js$/.test(filename)) {
				return;
			}
			var name = path.basename(filename, '.js');
			var param = opts[name] || {};
			var absolutePath = path.join(dir, Constants.DIR.COMPONENT, filename);
			if (!fs.existsSync(absolutePath)) {
				logger.error('component %s not exist at %s', name, absolutePath);
			} else {
				self.load(require(absolutePath), param);
			}
		});

		// load events
		if (!plugin.events) {
			return;
		} else {
			if (!fs.existsSync(plugin.events)) {
				logger.error('fail to find events, find path: %s', plugin.events);
				return;
			}

			fs.readdirSync(plugin.events).forEach((filename) => {
				if (!/\.js$/.test(filename)) {
					return;
				}
				var absolutePath = path.join(dir, Constants.DIR.EVENT, filename);
				if (!fs.existsSync(absolutePath)) {
					logger.error('events %s not exist at %s', filename, absolutePath);
				} else {
					this.bindEvents(require(absolutePath));
				}
			});
		}
	}

	/**
	 * Get master server info.
	 * @return master server info, {id, host, port}
	 */
	getMaster(): IMasterInfo {
		return this.master;
	}

	/**
	 * Get current server info.
	 * @return current server info, {id, serverType, host, port}
	 */
	getCurServer(): IServerInfo {
		return this.curServer;
	}

	/**
	 * Get current server id.
	 * @return ServerId current server id from servers.json
	 */
	getServerId(): ServerId {
		return this.serverId;
	}

	/**
	 * Get current server type.
	 * @return {String|Number} current server type from servers.json
	 */
	getServerType(): ServerType {
		return this.serverType;
	}

	/**
	 * Get all the current server infos.
	 * @return server info map, key: server id, value: server info
	 */
	getServers(): { [id: string]: IServerInfo } {
		return this.servers;
	}

	/**
	 * Get all server infos from servers.json.
	 * @return server info map, key: server id, value: server info
	 */
	getServersFromConfig() {
		return this.get<{ [id: string]: IServerInfo }>(Constants.KEYWORDS.SERVER_MAP);
	}

	/**
	 * Get all the server type.
	 * @return server type list
	 */
	getServerTypes(): ServerType[] {
		return this.serverTypes;
	}

	/**
	 * Get server info by server id from current server cluster.
	 * @param  serverId server id
	 * @return server info or undefined
	 */
	getServerById(serverId: ServerId): IServerInfo {
		return this.servers[serverId];
	}

	/**
	 * Get server info by server id from servers.json.
	 * @param  serverId server id
	 * @return server info or undefined
	 */
	getServerFromConfig(serverId: ServerId): IServerInfo {
		let serverMap = this.get<{ [id: string]: IServerInfo }>(Constants.KEYWORDS.SERVER_MAP);
		return serverMap[serverId];
	}

	/**
	 * Get server infos by server type.
	 * @param  serverType server type
	 * @return server info list
	 */
	getServersByType(serverType: ServerType): IServerInfo[] {
		return this.serverTypeMaps[serverType];
	}

	/**
	 * Check the server whether is a frontend server
	 * @param server server info. it would check current server
	 *               if server not specified
	 * @return is frontend or not
	 */
	isFrontend(server?: IServerInfo): boolean {
		server = server || this.getCurServer();
		return !!server && !!server.frontend;
	}

	/**
	 * Check the server whether is a backend server
	 * @param server server info. it would check current server
	 *               if server not specified
	 * @return is backend or not
	 */
	isBackend(server?: IServerInfo) {
		server = server || this.getCurServer();
		return !!server && !server.frontend;
	}

	/**
	 * Check whether current server is a master server
	 * @return is master or not
	 */
	isMaster(): boolean {
		return this.serverType === Constants.RESERVED.MASTER;
	}

	/**
	 * Add new server info to current application in runtime.
	 * @param servers new server info list
	 */
	addServers(servers: IServerInfo[]) {
		if (!servers || !servers.length) {
			return;
		}

		for (let i = 0, l = servers.length; i < l; i++) {
			let item = servers[i];
			// update global server map
			this.servers[item.id] = item;

			// update global server type map
			let slist = this.serverTypeMaps[item.serverType];
			if (!slist) {
				this.serverTypeMaps[item.serverType] = slist = [];
			}
			this.replaceServer(slist, item);

			// update global server type list
			if (this.serverTypes.indexOf(item.serverType) < 0) {
				this.serverTypes.push(item.serverType);
			}
		}
		this.event.emit(events.ADD_SERVERS, servers);
	}

	/**
	 * Remove server info from current application at runtime.
	 * @param ids server id list
	 */
	removeServers(ids: ServerId[]) {
		if (!ids || !ids.length) {
			return;
		}

		for (let i = 0, l = ids.length; i < l; i++) {
			let id = ids[i];
			let item = this.servers[id];
			if (!item) {
				continue;
			}
			// clean global server map
			delete this.servers[id];

			// clean global server type map
			let slist = this.serverTypeMaps[item.serverType];
			this.removeServer(slist, id);
			// TODO: should remove the server type if the slist is empty?
		}
		this.event.emit(events.REMOVE_SERVERS, ids);
	}

	/**
	 * Replace server info from current application at runtime.
	 * @param server id map
	 */
	replaceServers(servers: { [id: string]: IServerInfo }) {
		if (!servers) {
			return;
		}

		this.servers = servers;
		this.serverTypeMaps = {};
		this.serverTypes = [];
		let serverArray: IServerInfo[] = [];
		for (let id in servers) {
			let server = servers[id];
			let serverType = server.serverType;
			let slist = this.serverTypeMaps[serverType];
			if (!slist) {
				this.serverTypeMaps[serverType] = slist = [];
			}
			this.serverTypeMaps[serverType].push(server);
			// update global server type list
			if (this.serverTypes.indexOf(serverType) < 0) {
				this.serverTypes.push(serverType);
			}
			serverArray.push(server);
		}
		this.event.emit(events.REPLACE_SERVERS, serverArray);
	}

	/**
	 * Add crons from current application at runtime.
	 * @param crons new crons would be added in application
	 */
	addCrons(crons: ICronInfo[]) {
		if (!crons || !crons.length) {
			logger.warn('crons is not defined.');
			return;
		}
		this.event.emit(events.ADD_CRONS, crons);
	}

	/**
	 * Remove crons from current application at runtime.
	 * @param crons old crons would be removed in application
	 */
	removeCrons(crons: ICronInfo[]) {
		if (!crons || !crons.length) {
			logger.warn('ids is not defined.');
			return;
		}
		this.event.emit(events.REMOVE_CRONS, crons);
	}

	private replaceServer(slist: IServerInfo[], serverInfo: IServerInfo) {
		for (let i = 0, l = slist.length; i < l; i++) {
			if (slist[i].id === serverInfo.id) {
				slist[i] = serverInfo;
				return;
			}
		}
		slist.push(serverInfo);
	}

	private removeServer(slist: IServerInfo[], id: ServerId) {
		if (!slist || !slist.length) {
			return;
		}

		for (let i = 0, l = slist.length; i < l; i++) {
			if (slist[i].id === id) {
				slist.splice(i, 1);
				return;
			}
		}
	}

	private contains(str: string, settings: string) {
		if (!settings) {
			return false;
		}

		let ts = settings.split("|");
		for (let i = 0, l = ts.length; i < l; i++) {
			if (str === ts[i]) {
				return true;
			}
		}
		return false;
	}

	private bindEvents(event: IEvent | IEventConstructor) {
		let ev: IEvent
		if (typeof event === 'function') {
			ev = new event(this)
		} else {
			ev = event
		}
		let evMap: AnyMap = ev, map: AnyMap = events
		for (let e in map) {
			let evName = map[e]
			let evFunc: Function = evMap[evName]
			if (util.isFunction(evFunc)) {
				this.event.on(evName, function () { evFunc.apply(ev, arguments) })
			}
		}
	}

	private addFilter(type: string, filter: IFilter) {
		let filters = this.get<IFilter[]>(type);
		if (!filters) {
			filters = [];
			this.set(type, filters);
		}
		filters.push(filter);
	}

}
