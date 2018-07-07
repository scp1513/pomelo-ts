/**
 * Remote channel service for frontend server.
 * Receive push request from backend servers and push it to clients.
 */
import utils = require('../../../util/utils');
import { Application } from '../../../application';
import { Component as Connector } from '../../../components/connector'
import { SessionService } from '../../service/sessionService';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class Remote {
	app: Application


	constructor(app: Application) {
		this.app = app;
	}

	/**
	 * Push message to client by uids.
	 *
	 * @param  {String}   route route string of message
	 * @param  {Object}   msg   message
	 * @param  {Array}    uids  user ids that would receive the message
	 * @param  {Object}   opts  push options
	 * @param  {Function} cb    callback function
	 */
	pushMessage(route: string, msg: IRespMessage, uids: Uid[], opts, cb: Callback<Uid[]>) {
		if (!msg) {
			logger.error('Can not send empty message! route : %j, compressed msg : %j',
				route, msg);
			utils.invokeCallback(cb, new Error('can not send empty message.'));
			return;
		}

		let connector = this.app.components.__connector__ as Connector;

		let sessionService = this.app.get<SessionService>('sessionService');
		let fails: Uid[] = [], sids: number[] = [];
		for (let i = 0, l = uids.length; i < l; i++) {
			let sessions = sessionService.getByUid(uids[i]);
			if (!sessions) {
				fails.push(uids[i]);
			} else {
				for (let j = 0, k = sessions.length; j < k; j++) {
					sids.push(sessions[j].id);
				}
			}
		}
		logger.debug('[%s] pushMessage uids: %j, msg: %j, sids: %j', this.app.serverId, uids, msg, sids);
		connector.send(null, route, msg, sids, opts, function (err) {
			utils.invokeCallback(cb, err, fails);
		});
	}

	pushMsgs(msgs: IRespMessageWrap[], uids: Uid[], opts, cb: (errs: Error|Error[], fails?: Uid[]) => void) {
		if (!msgs) {
			logger.error('Can not send empty message! compressed msg : %j', msg);
			cb(new Error('can not send empty message.'));
			return;
		}
		if (msgs.length === 0) {
			cb(null, []);
			return;
		}

		let connector = this.app.components.__connector__ as Connector;

		let sessionService = this.app.get<SessionService>('sessionService');
		let fails: Uid[] = [], sids = [], sessions, j, k;
		for (let i = 0, l = uids.length; i < l; ++i) {
			sessions = sessionService.getByUid(uids[i]);
			if (!sessions) {
				fails.push(uids[i]);
			} else {
				for (j = 0, k = sessions.length; j < k; ++j) {
					sids.push(sessions[j].id);
				}
			}
		}
		let counter = 0;
		let errs: AnyErr[] = [];
		for (let i = 0, l = msgs.length; i < l; ++i) {
			var msg = msgs[i];
			logger.debug('[%s] pushMessage uids: %j, msg: %j, sids: %j', this.app.serverId, uids, msg, sids);
			connector.send(null, msg.route, msg.msg, sids, opts, function (err: Error) {
				++counter;
				errs.push(err);
				if (counter === msgs.length) {
					cb(errs, fails);
				}
			});
		}
	}

	/**
	 * Broadcast to all the client connectd with current frontend server.
	 *
	 * @param  {String}    route  route string
	 * @param  {Object}    msg    message
	 * @param  {Boolean}   opts   broadcast options. 
	 * @param  {Function}  cb     callback function
	 */
	broadcast(route: string, msg: IRespMessage, opts, cb: Callback<void>) {
		var connector = this.app.components.__connector__ as Connector;

		connector.send(null, route, msg, null, opts, cb);
	}

}
