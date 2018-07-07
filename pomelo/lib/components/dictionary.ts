import fs = require('fs');
import path = require('path');
import Loader = require('../../../pomelo-loader');
import pathUtil = require('../util/pathUtil');
import crypto = require('crypto');
import { Application } from '../application';

export class Component implements IComponent {
	static _name = '__dictionary__'
	app: Application
	dict: {[route: string]: number} = {}
	abbrs: {[abbr: number]: string} = {}
	userDicPath: string = null
	version = ''

	constructor(app: Application, opts?: IDictionaryOpts) {
		this.app = app;

		//Set user dictionary
		let p = path.join(app.getBase(), '/config/dictionary.json');
		if (!!opts && !!opts.dict) {
			p = opts.dict;
		}
		if (fs.existsSync(p)) {
			this.userDicPath = p;
		}
	}

	start(cb: Callback<void>) {
		let servers = this.app.get('servers');
		let routes: string[] = [];

		//Load all the handler files
		for (let serverType in servers) {
			let p = pathUtil.getHandlerPath(this.app.getBase(), serverType);
			if (!p) {
				continue;
			}

			let handlers = Loader.load(p, 'Handler', this.app);

			for (let name in handlers) {
				let handler = handlers[name];
				for (let key in handler) {
					if (typeof (handler[key]) === 'function') {
						routes.push(serverType + '.' + name + '.' + key);
					}
				}
			}
		}

		//Sort the route to make sure all the routers abbr are the same in all the servers
		routes.sort();
		for (let i = 0; i < routes.length; i++) {
			let abbr = i + 1;
			this.abbrs[abbr] = routes[i];
			this.dict[routes[i]] = abbr;
		}

		//Load user dictionary
		if (!!this.userDicPath) {
			let userDic = require(this.userDicPath);

			let abbr = routes.length + 1;
			for (let i = 0; i < userDic.length; i++) {
				let route = userDic[i];

				this.abbrs[abbr] = route;
				this.dict[route] = abbr;
				abbr++;
			}
		}

		this.version = crypto.createHash('md5').update(JSON.stringify(this.dict)).digest('base64');

		cb();
	}

	getDict() {
		return this.dict;
	}

	getAbbrs() {
		return this.abbrs;
	}

	getVersion() {
		return this.version;
	}

}
