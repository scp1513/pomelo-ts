/**
 * Component for server starup.
 */
import { Server } from '../server/server'
import { Application } from '../application'
import { FrontendSession } from '../common/service/sessionService'
import { BackendSession } from '../common/service/backendSessionService';

/**
 * Server component class
 *
 * @param {Object} app  current application context
 */
export class Component implements IComponent {
	static _name = '__server__'
	server: Server

	constructor(app: Application, opts: IHandlerServiceOpts) {
		this.server = new Server(app, opts);
	}

	/**
	 * Component lifecycle callback
	 * @param  cb
	 */
	start(cb: Callback<void>) {
		this.server.start();
		process.nextTick(cb);
	}

	/**
	 * Component lifecycle callback
	 * @param cb
	 */
	afterStart(cb: Callback<void>) {
		this.server.afterStart();
		process.nextTick(cb);
	}

	/**
	 * Component lifecycle function
	 * @param  force whether stop the component immediately
	 * @param  cb
	 */
	stop(force: boolean, cb: Callback<void>) {
		this.server.stop();
		process.nextTick(cb);
	}

	/**
	 * Proxy server handle
	 */
	handle(msg: IMessage, session: BackendSession, cb: HandlerCb) {
		this.server.handle(msg, session, cb);
	}

	/**
	 * Proxy server global handle
	 */
	globalHandle(msg: IMessage, session: FrontendSession, cb: HandlerCb) {
		this.server.globalHandle(msg, session, cb);
	}

}
