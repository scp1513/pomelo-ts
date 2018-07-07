import { EventEmitter } from 'events'
import utils = require('../../util/utils');

let logger = require('pomelo-logger').getLogger('pomelo', __filename);

let ST_INITED = 0;
let ST_CLOSED = 1;

/**
 * Session service maintains the internal session for each client connection.
 *
 * Session service is created by session component and is only
 * <b>available</b> in frontend servers. You can access the service by
 * `app.get('sessionService')` or `app.sessionService` in frontend servers.
 *
 * @param  opts constructor parameters
 * @class
 * @constructor
 */
export class SessionService {
	singleSession: boolean
	sessions: { [sid: number]: Session }
	uidMap: { [uid: string]: Session[] }

	constructor(opts?: ISessionServiceOpts) {
		opts = opts || {};
		this.singleSession = !!opts.singleSession;
		this.sessions = {};     // sid -> session
		this.uidMap = {};       // uid -> sessions
	}

	/**
	 * Create and return internal session.
	 * @param  sid uniqe id for the internal session 
	 * @param  frontendId frontend server in which the internal session is created 
	 * @param  socket the underlying socket would be held by the internal session  
	 * @return
	 */
	create(sid: number, frontendId: ServerId, socket: IPomeloSocket) {
		let session = new Session(sid, frontendId, socket, this);
		this.sessions[session.id] = session;

		return session;
	}

	/**
	 * Bind the session with a user id.
	 */
	bind(sid: number, uid: Uid, cb: Callback<void>) {
		let session = this.sessions[sid];

		if (!session) {
			process.nextTick(function () {
				cb(new Error('session does not exist, sid: ' + sid));
			});
			return;
		}

		if (session.uid) {
			if (session.uid === uid) {
				// already bound with the same uid
				cb();
				return;
			}

			// already bound with other uid
			process.nextTick(function () {
				cb(new Error('session has already bind with ' + session.uid));
			});
			return;
		}

		let sessions = this.uidMap[uid];

		if (this.singleSession && !!sessions) {
			process.nextTick(function () {
				cb(new Error('singleSession is enabled, and session has already bind with uid: ' + uid));
			});
			return;
		}

		if (!sessions) {
			sessions = this.uidMap[uid] = [];
		}

		for (let i = 0, l = sessions.length; i < l; i++) {
			// session has binded with the uid
			if (sessions[i].id === session.id) {
				process.nextTick(cb);
				return;
			}
		}
		sessions.push(session);
		session.bind(uid);
		process.nextTick(cb);
	}

	/**
	 * Unbind a session with the user id.
	 */
	unbind(sid: number, uid: Uid, cb: Callback<void>) {
		let session = this.sessions[sid];

		if (!session) {
			process.nextTick(function () {
				cb(new Error('session does not exist, sid: ' + sid));
			});
			return;
		}

		if (!session.uid || session.uid !== uid) {
			process.nextTick(function () {
				cb(new Error('session has not bind with ' + session.uid));
			});
			return;
		}

		let sessions = this.uidMap[uid], sess;
		if (sessions) {
			for (let i = 0, l = sessions.length; i < l; i++) {
				sess = sessions[i];
				if (sess.id === sid) {
					sessions.splice(i, 1);
					break;
				}
			}

			if (sessions.length === 0) {
				delete this.uidMap[uid];
			}
		}
		session.unbind(uid);
		process.nextTick(cb);
	}

	/**
	 * Get session by id.
	 * @param  id The session id
	 * @return 
	 */
	get(sid: number) {
		return this.sessions[sid];
	}

	/**
	 * Get sessions by userId.
	 * @param  uid User id associated with the session
	 * @return list of session binded with the uid
	 */
	getByUid(uid: Uid): Session[] {
		return this.uidMap[uid];
	}

	/**
	 * Remove session by key.
	 * @param  sid The session id
	 */
	remove(sid: number) {
		let session = this.sessions[sid];
		if (session) {
			let uid = session.uid;
			delete this.sessions[session.id];

			let sessions = this.uidMap[uid];
			if (!sessions) {
				return;
			}

			for (let i = 0, l = sessions.length; i < l; i++) {
				if (sessions[i].id === sid) {
					sessions.splice(i, 1);
					if (sessions.length === 0) {
						delete this.uidMap[uid];
					}
					break;
				}
			}
		}
	}

	/**
	 * Import the key/value into session.
	 */
	import(sid: number, key: string, value: any, cb: Callback<void>) {
		let session = this.sessions[sid];
		if (!session) {
			cb(new Error('session does not exist, sid: ' + sid));
			return;
		}
		session.set(key, value);
		cb();
	}

	/**
	 * Import new value for the existed session.
	 */
	importAll(sid: number, settings: AnyMap, cb: Callback<void>) {
		let session = this.sessions[sid];
		if (!session) {
			cb(new Error('session does not exist, sid: ' + sid));
			return;
		}

		for (let f of Object.keys(settings)) {
			session.set(f, settings[f]);
		}
		cb();
	}

	/**
	 * Kick all the session offline under the user id.
	 * @param  uid user id asscociated with the session
	 * @param  cb  callback function
	 */
	kick(uid: Uid, reason: any, cb: Callback<void>) {
		// compatible for old kick(uid, cb);
		if (typeof reason === 'function') {
			cb = reason;
			reason = 'kick';
		}
		let sessions = this.getByUid(uid);

		if (sessions) {
			// notify client
			for (let session of sessions) {
				session.closed(reason);
			}

			process.nextTick(function () {
				cb();
			});
		} else {
			process.nextTick(function () {
				cb();
			});
		}
	}

	/**
	 * Kick a user offline by session id.
	 * @param  sid session id
	 * @param  cb  callback function
	 */
	kickBySessionId(sid: number, reason: any, cb: Callback<void>) {
		if (typeof reason === 'function') {
			cb = reason;
			reason = 'kick';
		}

		let session = this.get(sid);

		if (session) {
			// notify client
			session.closed(reason);
			process.nextTick(function () {
				cb();
			});
		} else {
			process.nextTick(function () {
				cb();
			});
		}
	}

	/**
	 * Get client remote address by session id.
	 * @param  sid session id
	 * @return remote address of client
	 */
	getClientAddressBySessionId(sid: number) {
		let session = this.get(sid);
		if (session) {
			let socket = session.__socket__;
			return socket.remoteAddress;
		} else {
			return null;
		}
	}

	/**
	 * Send message to the client by session id.
	 * @param {String} sid session id
	 * @param {Object} msg message to send
	 */
	sendMessage(sid: number, msg: string|Buffer) {
		let session = this.get(sid);

		if (!session) {
			logger.debug('Fail to send message for non-existing session, sid: ' + sid + ' msg: ' + msg);
			return false;
		}

		session.send(msg)
		return true
	}

	/**
	 * Send message to the client by user id.
	 * @param uid userId
	 * @param msg message to send
	 */
	sendMessageByUid(uid: Uid, msg: string|Buffer) {
		let sessions = this.getByUid(uid);

		if (!sessions) {
			logger.debug('fail to send message by uid for non-existing session. uid: %j',
				uid);
			return false;
		}

		for (let i = 0, l = sessions.length; i < l; i++) {
			sessions[i].send(msg);
		}

		return true
	}

	/**
	 * Iterate all the session in the session service.
	 * @param  cb callback function to fetch session
	 */
	forEachSession(cb: (session: Session) => void) {
		for (let sid of Object.keys(this.sessions)) {
			cb(this.sessions[<number><any>sid]);
		}
	}

	/**
	 * Iterate all the binded session in the session service.
	 * @param  cb callback function to fetch session
	 */
	forEachBindedSession(cb: (session: Session) => void) {
		let i, l, sessions;
		for (let uid of Object.keys(this.uidMap)) {
			sessions = this.uidMap[uid];
			for (i = 0, l = sessions.length; i < l; i++) {
				cb(sessions[i]);
			}
		}
	}

	/**
	 * Get sessions' quantity in specified server.
	 */
	getSessionsCount() {
		return utils.size(this.sessions);
	}

}

/**
 * Session maintains the relationship between client connection and user information.
 * There is a session associated with each client connection. And it should bind to a
 * user id after the client passes the identification.
 *
 * Session is created in frontend server and should not be accessed in handler.
 * There is a proxy class called BackendSession in backend servers and FrontendSession 
 * in frontend servers.
 */
export class Session extends EventEmitter implements ISession {
	id: number
	frontendId: ServerId
	uid: Uid
	settings: { [key: string]: any }
	__socket__: IPomeloSocket
	__sessionService__: SessionService
	__state__: number

	constructor(sid: number, frontendId: ServerId, socket: IPomeloSocket, service: SessionService) {
		super()
		this.id = sid;          // r
		this.frontendId = frontendId; // r
		this.uid = null;        // r
		this.settings = {};

		// private
		this.__socket__ = socket;
		this.__sessionService__ = service;
		this.__state__ = ST_INITED;
	}

	/*
	 * Export current session as frontend session.
	 */
	toFrontendSession() {
		return new FrontendSession(this);
	}

	/**
	 * Bind the session with the the uid.
	 * @param uid User id
	 */
	bind(uid: Uid) {
		this.uid = uid;
		this.emit('bind', uid);
	}

	/**
	 * Unbind the session with the the uid.
	 * @param uid User id
	 */
	unbind(uid: Uid) {
		this.uid = null;
		this.emit('unbind', uid);
	}

	/**
	 * Set values (one or many) for the session.
	 * @param key session key
	 * @param value session value
	 */
	set(key: string | AnyMap, value: any) {
		if (typeof key !== 'string') {
			for (let i of Object.keys(key)) {
				this.settings[i] = key[i];
			}
		} else {
			this.settings[key] = value;
		}
	}

	/**
	 * Remove value from the session.
	 * @param key session key
	 */
	remove(key: string) {
		delete this.settings[key];
	}

	/**
	 * Get value from the session.
	 * @param  key session key
	 * @return value associated with session key
	 */
	get<T>(key: string): T {
		return this.settings[key];
	}

	/**
	 * Send message to the session.
	 * @param  msg final message sent to client
	 */
	send(msg: string|Buffer) {
		this.__socket__.send(msg);
	}

	/**
	 * Send message to the session in batch.
	 * @param  msgs list of message
	 */
	sendBatch(msgs: Buffer[]) {
		this.__socket__.sendBatch(msgs);
	}

	/**
	 * Closed callback for the session which would disconnect client in next tick.
	 */
	closed(reason: any) {
		logger.debug('session on [%s] is closed with session id: %s', this.frontendId, this.id);
		if (this.__state__ === ST_CLOSED) {
			return;
		}
		this.__state__ = ST_CLOSED;
		this.__sessionService__.remove(this.id);
		this.emit('closed', this.toFrontendSession(), reason);
		this.__socket__.emit('closing', reason);

		let self = this;
		// give a chance to send disconnect message to client

		process.nextTick(function () {
			self.__socket__.disconnect();
		});
	}

}

/**
 * Frontend session for frontend server.
 */
export class FrontendSession extends EventEmitter implements IFrontendSession {
	id: number
	frontendId: ServerId
	uid: Uid
	settings: AnyMap
	__session__: Session
	__sessionService__: SessionService

	constructor(session: Session) {
		super()
		this.id = session.id
		this.frontendId = session.frontendId
		this.uid = session.uid
		this.settings = this.dclone(session.settings)
		this.__sessionService__ = session.__sessionService__
		this.__session__ = session
	};


	bind(uid: Uid, cb: Callback<void>) {
		this.__sessionService__.bind(this.id, uid, (err) => {
			if (!err) {
				this.uid = uid;
			}
			cb(err);
		});
	}

	unbind(uid: Uid, cb: Callback<void>) {
		this.__sessionService__.unbind(this.id, uid, (err) => {
			if (!err) {
				this.uid = null;
			}
			cb(err);
		});
	}

	set(key: string, value: any) {
		this.settings[key] = value;
	}

	get<T>(key: string): T {
		return this.settings[key];
	}

	push(key: string, cb: Callback<void>) {
		this.__sessionService__.import(this.id, key, this.get(key), cb);
	}

	pushAll(cb: Callback<void>) {
		this.__sessionService__.importAll(this.id, this.settings, cb);
	}

	on(event: string, listener: (...args: any[]) => void) {
		super.on(event, listener)
		this.__session__.on(event, listener);
		return this
	}

	/**
	 * Export the key/values for serialization.
	 */
	export(): IBackendSessionOpts {
		let res = {
			id: this.id,
			frontendId: this.frontendId,
			uid: this.uid,
			settings: this.settings
		};
		return res;
	}

	dclone(src: AnyMap) {
		var res: AnyMap = {};
		for(var f in src) {
			res[f] = src[f];
		}
		return res;
	}

}
