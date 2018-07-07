import { Application } from '../../../application';
import { BackendSessionService } from '../../service/backendSessionService';
import { Component as Server } from '../../../components/server'

var logger = require('pomelo-logger').getLogger('forward-log', __filename);

/**
 * Remote service for backend servers.
 * Receive and handle request message forwarded from frontend server.
 */
export class Remote {
	app: Application

	constructor(app: Application) {
		this.app = app;
	}

	/**
	 * Forward message from frontend server to other server's handlers
	 *
	 * @param msg {Object} request message
	 * @param session {Object} session object for current request
	 * @param cb {Function} callback function
	 */
	forwardMessage(msg: IMessage, session: IBackendSessionOpts, cb: (err: AnyErr, resp?: AnyMap, opts?: AnyMap) => void) {
		let server = this.app.components.__server__ as Server;
		let sessionService = this.app.components.__backendSession__ as BackendSessionService;

		if (!server) {
			logger.error('server component not enable on %s', this.app.serverId);
			cb(new Error('server component not enable'));
			return;
		}

		if (!sessionService) {
			logger.error('backend session component not enable on %s', this.app.serverId);
			cb(new Error('backend sesssion component not enable'));
			return;
		}

		// generate backend session for current request
		var backendSession = sessionService.create(session);

		// handle the request

		logger.debug('backend server [%s] handle message: %j', this.app.serverId, msg);

		server.handle(msg, backendSession, function (err, resp, opts) {
			// cb && cb(err, resp, opts);
			cb(err, resp, opts);
		});
	}

}
