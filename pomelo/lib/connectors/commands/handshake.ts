import pomelo = require('../../pomelo');
import { Component as Connector } from '../../components/connector'
import { Component as Dictionary } from '../../components/dictionary'
import { Component as Protobuf } from '../../components/protobuf'
import { Package } from '../../../../pomelo-protocol';

var CODE_OK = 200;
var CODE_USE_ERROR = 500;
var CODE_OLD_CLIENT = 501;

interface IOpts {
	handshake?: (msg: any, cb: (err: AnyErr, resp?: any) => void, socket?: IPomeloSocket) => void
	heartbeat?: number
	checkClient?: (type: string, version: string) => boolean
	useDict?: boolean
	useProtobuf?: boolean
	useCrypto?: boolean
}

/**
 * Process the handshake request.
 *
 * @param {Object} opts option parameters
 *                      opts.handshake(msg, cb(err, resp)) handshake callback. msg is the handshake message from client.
 *                      opts.hearbeat heartbeat interval (level?)
 *                      opts.version required client level
 */
export class Command {
	userHandshake: (msg: any, cb: (err: AnyErr, resp?: any) => void, socket?: IPomeloSocket) => void
	heartbeatSec: number
	heartbeat: number
	checkClient: (type: string, version: string) => boolean
	useDict: boolean
	useProtobuf: boolean
	useCrypto: boolean

	constructor(opts: IOpts) {
		this.userHandshake = opts.handshake;

		if (opts.heartbeat) {
			this.heartbeatSec = opts.heartbeat;
			this.heartbeat = opts.heartbeat * 1000;
		}

		this.checkClient = opts.checkClient;

		this.useDict = !!opts.useDict;
		this.useProtobuf = !!opts.useProtobuf;
		this.useCrypto = !!opts.useCrypto;
	}

	handle(socket: IPomeloSocket, msg: IHandshakeCli) {
		if (!msg.sys) {
			this.processError(socket, CODE_USE_ERROR);
			return;
		}

		if (typeof this.checkClient === 'function') {
			if (!msg || !msg.sys || !this.checkClient(msg.sys.type, msg.sys.version)) {
				this.processError(socket, CODE_OLD_CLIENT);
				return;
			}
		}

		var opts: IHandshakeSrv = {
			heartbeat: this.setupHeartbeat()
		};

		if (this.useDict) {
			let dictionary = pomelo.app.components.__dictionary__ as Dictionary
			var dictVersion = dictionary.getVersion();
			if (!msg.sys.dictVersion || msg.sys.dictVersion !== dictVersion) {

				// may be deprecated in future
				opts.dict = dictionary.getDict();

				opts.routeToCode = dictionary.getDict();
				opts.codeToRoute = dictionary.getAbbrs();
				opts.dictVersion = dictVersion;
			}
			opts.useDict = true;
		}

		if (!!this.useProtobuf) {
			let dictionary = pomelo.app.components.__protobuf__ as Protobuf
			var protoVersion = dictionary.getVersion();
			if (!msg.sys.protoVersion || msg.sys.protoVersion !== protoVersion) {
				opts.protos = dictionary.getProtos();
			}
			opts.useProto = true;
		}

		if (this.useCrypto) {
			(pomelo.app.components.__connector__ as Connector).setPubKey(socket.id, msg.sys.rsa);
		}

		if (typeof this.userHandshake === 'function') {
			this.userHandshake(msg, (err, resp?) => {
				if (err) {
					process.nextTick(() => {
						this.processError(socket, CODE_USE_ERROR);
					});
					return;
				}
				process.nextTick(() => {
					this.response(socket, opts, resp);
				});
			}, socket);
			return;
		}

		process.nextTick(() => {
			this.response(socket, opts)
		});
	}

	private setupHeartbeat() {
		return this.heartbeatSec
	}

	private response(socket: IPomeloSocket, sys: IHandshakeSrv, resp?: any) {
		let res = { code: CODE_OK, sys, user: resp ? resp : undefined }
		socket.handshakeResponse(Package.encode(Package.TYPE_HANDSHAKE, new Buffer(JSON.stringify(res))))
	}

	private processError(socket: IPomeloSocket, code: number) {
		let res = { code }
		socket.sendForce(Package.encode(Package.TYPE_HANDSHAKE, new Buffer(JSON.stringify(res))))
		process.nextTick(function () {
			socket.disconnect()
		})
	}

}
