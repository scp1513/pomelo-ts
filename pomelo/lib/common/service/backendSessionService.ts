/**
 * backend session service for backend session
 */
import utils = require('../../util/utils');
import { Application } from "../../application";


/**
 * Service that maintains backend sessions and the communication with frontend
 * servers.
 *
 * BackendSessionService would be created in each server process and maintains
 * backend sessions for current process and communicates with the relative
 * frontend servers.
 *
 * BackendSessionService instance could be accessed by
 * `app.get('backendSessionService')` or app.backendSessionService.
 *
 * @class
 * @constructor
 */
export class BackendSessionService {
	app: Application

	constructor(app: Application) {
		this.app = app;
	}

	create(opts: IBackendSessionOpts) {
		if (!opts) {
			throw new Error('opts should not be empty.');
		}
		return new BackendSession(opts, this);
	}

	/**
	 * Get backend session by frontend server id and session id.
	 *
	 * @param  {String}   frontendId frontend server id that session attached
	 * @param  {String}   sid        session id
	 * @param  {Function} cb         callback function. args: cb(err, BackendSession)
	 *
	 * @memberOf BackendSessionService
	 */
	get(frontendId: ServerId, sid: number, cb: Callback<BackendSession>) {
		let namespace = 'sys';
		let service = 'sessionRemote';
		let method = 'getBackendSessionBySid';
		let args = [sid];
		this.rpcInvoke(this.app, frontendId, namespace, service, method,
			args, (err, sinfo: IBackendSessionOpts) => this.BackendSessionCB(cb, err, sinfo));
	}

	/**
	 * Get backend sessions by frontend server id and user id.
	 *
	 * @param  {String}   frontendId frontend server id that session attached
	 * @param  {String}   uid        user id binded with the session
	 * @param  {Function} cb         callback function. args: cb(err, BackendSessions)
	 *
	 * @memberOf BackendSessionService
	 */
	getByUid(frontendId: ServerId, uid: Uid, cb: Callback<BackendSession|BackendSession[]>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'getBackendSessionsByUid';
		var args = [uid];
		this.rpcInvoke(this.app, frontendId, namespace, service, method,
			args, (err, sinfo: IBackendSessionOpts[]) => this.BackendSessionCB(cb, err, sinfo));
	}

	/**
	 * Kick a session by session id.
	 *
	 * @param  {String}   frontendId cooperating frontend server id
	 * @param  {Number}   sid        session id
	 * @param  {Function} cb         callback function
	 *
	 * @memberOf BackendSessionService
	 */
	kickBySid(frontendId: ServerId, sid: number, reason: any, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'kickBySid';
		var args = [sid, reason];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	/**
	 * Kick sessions by user id.
	 *
	 * @param  {String}          frontendId cooperating frontend server id
	 * @param  {Number|String}   uid        user id
	 * @param  {String}          reason     kick reason
	 * @param  {Function}        cb         callback function
	 *
	 * @memberOf BackendSessionService
	 */
	kickByUid(frontendId: ServerId, uid: Uid, reason: any, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'kickByUid';
		var args = [uid, reason];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	/**
	 * Bind the session with the specified user id. It would finally invoke the
	 * the sessionService.bind in the cooperating frontend server.
	 *
	 * @param  {String}   frontendId cooperating frontend server id
	 * @param  {Number}   sid        session id
	 * @param  {String}   uid        user id
	 * @param  {Function} cb         callback function
	 *
	 * @memberOf BackendSessionService
	 * @api private
	 */
	bind(frontendId: ServerId, sid: number, uid: Uid, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'bind';
		var args = [sid, uid];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	/**
	 * Unbind the session with the specified user id. It would finally invoke the
	 * the sessionService.unbind in the cooperating frontend server.
	 *
	 * @param  {String}   frontendId cooperating frontend server id
	 * @param  {Number}   sid        session id
	 * @param  {String}   uid        user id
	 * @param  {Function} cb         callback function
	 *
	 * @memberOf BackendSessionService
	 * @api private
	 */
	unbind(frontendId: ServerId, sid: number, uid: Uid, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'unbind';
		var args = [sid, uid];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	/**
	 * Push the specified customized change to the frontend internal session.
	 *
	 * @param  {String}   frontendId cooperating frontend server id
	 * @param  {Number}   sid        session id
	 * @param  {String}   key        key in session that should be push
	 * @param  {Object}   value      value in session, primitive js object
	 * @param  {Function} cb         callback function
	 *
	 * @memberOf BackendSessionService
	 * @api private
	 */
	push(frontendId: ServerId, sid: number, key: string, value: any, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'push';
		var args = [sid, key, value];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	/**
	 * Push all the customized changes to the frontend internal session.
	 *
	 * @param  {String}   frontendId cooperating frontend server id
	 * @param  {Number}   sid        session id
	 * @param  {Object}   settings   key/values in session that should be push
	 * @param  {Function} cb         callback function
	 *
	 * @memberOf BackendSessionService
	 * @api private
	 */
	pushAll(frontendId: ServerId, sid: number, settings: AnyMap, cb: Callback<void>) {
		var namespace = 'sys';
		var service = 'sessionRemote';
		var method = 'pushAll';
		var args = [sid, settings];
		this.rpcInvoke(this.app, frontendId, namespace, service, method, args, cb);
	}

	private rpcInvoke<T>(app: Application, sid: ServerId, namespace: string, service: string, method: string, args: any[], cb: Callback<T>) {
		app.rpcInvoke(sid, { namespace, service, method, args }, cb);
	}

	private BackendSessionCB(cb: Callback<BackendSession|BackendSession[]>, err: AnyErr, sinfo: IBackendSessionOpts|IBackendSessionOpts[]) {
		if (err) {
			cb(err);
			return;
		}

		if (!sinfo) {
			cb();
			return;
		}
		var sessions: BackendSession | BackendSession[];
		if (Array.isArray(sinfo)) {
			// #getByUid
			sessions = []
			for (var i = 0, k = sinfo.length; i < k; i++) {
				sessions.push(this.create(sinfo[i]));
			}
		}
		else {
			// #get
			sessions = this.create(sinfo);
		}
		cb(null, sessions);
	}

}

/**
 * BackendSession is the proxy for the frontend internal session passed to handlers and
 * it helps to keep the key/value pairs for the server locally.
 * Internal session locates in frontend server and should not be accessed directly.
 *
 * The mainly operation on backend session should be read and any changes happen in backend
 * session is local and would be discarded in next request. You have to push the
 * changes to the frontend manually if necessary. Any push would overwrite the last push
 * of the same key silently and the changes would be saw in next request.
 * And you have to make sure the transaction outside if you would push the session
 * concurrently in different processes.
 *
 * See the api below for more details.
 *
 * @class
 * @constructor
 */
export class BackendSession implements IBackendSession {
	__sessionService__: BackendSessionService
	frontendId: ServerId
	id: number
	uid: Uid
	settings: AnyMap

	constructor(opts: IBackendSessionOpts, service: BackendSessionService) {
		this.frontendId = opts.frontendId
		this.id = opts.id
		this.uid = opts.uid
		this.settings = opts.settings
		this.__sessionService__ = service
	}

	/**
	 * Bind current session with the user id. It would push the uid to frontend
	 * server and bind  uid to the frontend internal session.
	 *
	 * @param  {Number|String}   uid user id
	 * @param  {Function} cb  callback function
	 *
	 * @memberOf BackendSession
	 */
	bind(uid: Uid, cb: Callback<void>) {
		this.__sessionService__.bind(this.frontendId, this.id, uid, (err) => {
			if (!err) {
				this.uid = uid;
			}
			cb(err);
		});
	}

	/**
	 * Unbind current session with the user id. It would push the uid to frontend
	 * server and unbind uid from the frontend internal session.
	 *
	 * @param  {Number|String}   uid user id
	 * @param  {Function} cb  callback function
	 *
	 * @memberOf BackendSession
	 */
	unbind(uid:Uid, cb: Callback<void>) {
		this.__sessionService__.unbind(this.frontendId, this.id, uid, (err) =>{
			if (!err) {
				this.uid = null;
			}
			utils.invokeCallback(cb, err);
		});
	}

	/**
	 * Set the key/value into backend session.
	 *
	 * @param {String} key   key
	 * @param {Object} value value
	 */
	set(key: string, value: any) {
		this.settings[key] = value;
	}

	/**
	 * Get the value from backend session by key.
	 *
	 * @param  {String} key key
	 * @return {Object}     value
	 */
	get<T>(key: string): T {
		return this.settings[key];
	}

	/**
	 * Push the key/value in backend session to the front internal session.
	 *
	 * @param  {String}   key key
	 * @param  {Function} cb  callback function
	 */
	push(key: string, cb: Callback<void>) {
		this.__sessionService__.push(this.frontendId, this.id, key, this.get(key), cb);
	}

	/**
	 * Push all the key/values in backend session to the frontend internal session.
	 *
	 * @param  {Function} cb callback function
	 */
	pushAll(cb: Callback<void>) {
		this.__sessionService__.pushAll(this.frontendId, this.id, this.settings, cb);
	}

	/**
	 * Export the key/values for serialization.
	 *
	 * @api private
	 */
	export() {
		return {
			id: this.id,
			frontendId: this.frontendId,
			uid: this.uid,
			settings: this.settings,
		}
	}
}
