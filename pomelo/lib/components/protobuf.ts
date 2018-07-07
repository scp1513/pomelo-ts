import fs = require('fs');
import path = require('path');
import crypto = require('crypto');
import Constants = require('../util/constants');
import { Application } from '../application';
import protobuf = require('../../../pomelo-protobuf');

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class Component implements IComponent {
	static _name = '__protobuf__'
	app: Application
	watchers: {[type: string]: fs.FSWatcher}
	serverProtos: {[route: string]: IProtoParsed}
	clientProtos: {[route: string]: IProtoParsed}
	version: string
	serverProtosPath: string
	clientProtosPath: string

	constructor(app: Application, opts) {
		this.app = app;
		opts = opts || {};
		this.watchers = {};
		this.serverProtos = {};
		this.clientProtos = {};
		this.version = "";

		var env = app.get<string>(Constants.RESERVED.ENV);
		var originServerPath = path.join(app.getBase(), Constants.FILEPATH.SERVER_PROTOS);
		var presentServerPath = path.join(Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.SERVER_PROTOS));
		var originClientPath = path.join(app.getBase(), Constants.FILEPATH.CLIENT_PROTOS);
		var presentClientPath = path.join(Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.CLIENT_PROTOS));

		this.serverProtosPath = opts.serverProtos || (fs.existsSync(originServerPath) ? Constants.FILEPATH.SERVER_PROTOS : presentServerPath);
		this.clientProtosPath = opts.clientProtos || (fs.existsSync(originClientPath) ? Constants.FILEPATH.CLIENT_PROTOS : presentClientPath);

		this.setProtos(Constants.RESERVED.SERVER, path.join(app.getBase(), this.serverProtosPath));
		this.setProtos(Constants.RESERVED.CLIENT, path.join(app.getBase(), this.clientProtosPath));

		protobuf.init({ encoderProtos: this.serverProtos, decoderProtos: this.clientProtos });
	}

	encode(key: string, msg: AnyMap) {
		return protobuf.encode(key, msg);
	}

	encode2Bytes(key: string, msg: AnyMap) {
		return protobuf.encode2Bytes(key, msg);
	}

	decode(key: string, buf: Buffer) {
		return protobuf.decode(key, buf);
	}

	getProtos() {
		return {
			server: this.serverProtos,
			client: this.clientProtos,
			version: this.version
		};
	}

	getVersion() {
		return this.version;
	}

	setProtos(type: string, path: string) {
		if (!fs.existsSync(path)) {
			return;
		}

		if (type === Constants.RESERVED.SERVER) {
			this.serverProtos = protobuf.parse(require(path));
		}

		if (type === Constants.RESERVED.CLIENT) {
			this.clientProtos = protobuf.parse(require(path));
		}

		delete require.cache[require.resolve(path)];
		var protoStr = JSON.stringify(this.clientProtos) + JSON.stringify(this.serverProtos);
		this.version = crypto.createHash('md5').update(protoStr).digest('base64');

		//Watch file
		var watcher = fs.watch(path, (event: string) => {this.onUpdate(type, path, event) });
		if (this.watchers[type]) {
			this.watchers[type].close();
		}
		this.watchers[type] = watcher;
	}

	onUpdate(type: string, path: string, event: string) {
		if (event !== 'change') {
			return;
		}

		var self = this;
		try {
			var protos = require(path);
			protos = protobuf.parse(protos);
			delete require.cache[require.resolve(path)];
			if (type === Constants.RESERVED.SERVER) {
				protobuf.setEncoderProtos(protos);
				self.serverProtos = protos;
			} else {
				protobuf.setDecoderProtos(protos);
				self.clientProtos = protos;
			}
			var protoStr = JSON.stringify(self.clientProtos) + JSON.stringify(self.serverProtos);
			self.version = crypto.createHash('md5').update(protoStr).digest('base64');
			logger.info('change proto file , type : %j, path : %j, version : %j', type, path, self.version);
		} catch (e) {
			logger.warn("change proto file error! path : %j", path);
			logger.warn(e);
		}
	}

	stop(force: boolean, cb: Callback<void>) {
		for (var type in this.watchers) {
			this.watchers[type].close();
		}
		this.watchers = {};
		process.nextTick(cb);
	}

}
