/**
 * Remote session service for frontend server.
 * Set session info for backend servers.
 */
import { Application } from '../../../application'
import { SessionService } from '../../service/sessionService'

export class Remote {
	app: Application

	constructor(app: Application) {
		this.app = app
	}

	bind(sid: number, uid: Uid, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').bind(sid, uid, cb)
	}

	unbind(sid: number, uid: Uid, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').unbind(sid, uid, cb)
	}

	push(sid: number, key: string, value: any, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').import(sid, key, value, cb)
	}

	pushAll(sid: number, settings: AnyMap, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').importAll(sid, settings, cb)
	}

	/**
	 * Get session informations with session id.
	 *
	 * @param  {String}   sid session id binded with the session
	 * @param  {Function} cb(err, sinfo)  callback funtion, sinfo would be null if the session not exist.
	 */
	getBackendSessionBySid(sid: number, cb: Callback<IBackendSessionOpts>) {
		var session = this.app.get<SessionService>('sessionService').get(sid)
		if (!session) {
			cb()
			return
		}
		cb(null, session.toFrontendSession().export())
	}

	/**
	 * Get all the session informations with the specified user id.
	 *
	 * @param  {String}   uid user id binded with the session
	 * @param  {Function} cb(err, sinfo)  callback funtion, sinfo would be null if the session does not exist.
	 */
	getBackendSessionsByUid(uid: Uid, cb: Callback<IBackendSessionOpts[]>) {
		let sessions = this.app.get<SessionService>('sessionService').getByUid(uid)
		if (!sessions) {
			cb()
			return
		}

		let res: IBackendSessionOpts[] = []
		for (let i = 0, l = sessions.length; i < l; i++) {
			res.push(sessions[i].toFrontendSession().export())
		}
		cb(null, res)
	}

	/**
	 * Kick a session by session id.
	 *
	 * @param  {Number}   sid session id
	 * @param  {String}   reason  kick reason
	 * @param  {Function} cb  callback function
	 */
	kickBySid(sid: number, reason: any, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').kickBySessionId(sid, reason, cb)
	}

	/**
	 * Kick sessions by user id.
	 *
	 * @param  {Number|String}   uid user id
	 * @param  {String}          reason     kick reason
	 * @param  {Function} cb     callback function
	 */
	kickByUid(uid: Uid, reason: any, cb: Callback<void>) {
		this.app.get<SessionService>('sessionService').kick(uid, reason, cb)
	}

}
