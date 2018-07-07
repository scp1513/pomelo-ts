import utils = require('../util/utils');
import { Application } from '../application';
import { SessionService, Session } from '../common/service/sessionService';
import { ChannelService } from '../common/service/channelService';

let DEFAULT_FLUSH_INTERVAL = 20;

export class Scheduler implements IScheduler {
	app: Application
	flushInterval: number
	sessions: {[sessionId: number]: Buffer[]}
	tid: any

	constructor(app: Application, opts?: {flushInterval?: number}) {
		opts = opts || {};
		this.app = app;
		this.flushInterval = opts.flushInterval || DEFAULT_FLUSH_INTERVAL;
		this.sessions = {};   // sid -> msg queue
		this.tid = null;
	}

	start(cb: (err?: AnyErr)=>void) {
		this.tid = setInterval(() => this.flush(), this.flushInterval);
		process.nextTick(function () {
			utils.invokeCallback(cb);
		});
	}

	stop(force: boolean, cb: (err?: AnyErr)=>void) {
		if (this.tid) {
			clearInterval(this.tid);
			this.tid = null;
		}
		process.nextTick(function () {
			utils.invokeCallback(cb);
		});
	}

	schedule(reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: Callback<void>) {
		opts = opts || {};
		if (opts.type === 'broadcast') {
			this.doBroadcast(msg, opts.userOptions);
		} else {
			this.doBatchPush(msg, recvs);
		}

		process.nextTick(function () {
			cb();
		});
	}

	private doBroadcast(msg: Buffer, opts) {
		var channelService = this.app.get<ChannelService>('channelService');
		var sessionService = this.app.get<SessionService>('sessionService');

		if (opts.binded) {
			sessionService.forEachBindedSession((session) => {
				if (channelService.broadcastFilter &&
					!channelService.broadcastFilter(session, msg, opts.filterParam)) {
					return;
				}

				this.enqueue(session, msg);
			});
		} else {
			sessionService.forEachSession((session) => {
				if (channelService.broadcastFilter &&
					!channelService.broadcastFilter(session, msg, opts.filterParam)) {
					return;
				}

				this.enqueue(session, msg);
			});
		}
	}

	private doBatchPush(msg: Buffer, recvs: number[]) {
		var sessionService = this.app.get<SessionService>('sessionService');
		var session;
		for (var i = 0, l = recvs.length; i < l; i++) {
			session = sessionService.get(recvs[i]);
			if (session) {
				this.enqueue(session, msg);
			}
		}
	}

	private enqueue(session: Session, msg: Buffer) {
		var queue = this.sessions[session.id];
		if (!queue) {
			queue = this.sessions[session.id] = [];
			session.once('closed', (session) => this.onClose(session));
		}

		queue.push(msg);
	}

	private onClose(session: Session) {
		delete this.sessions[session.id];
	}

	private flush() {
		var sessionService = this.app.get<SessionService>('sessionService');
		var session: Session;
		for (var sid in this.sessions) {
			session = sessionService.get(Number(sid))
			if (!session) {
				continue;
			}

			let queue = this.sessions[sid];
			if (!queue || queue.length === 0) {
				continue;
			}

			session.sendBatch(queue);
			this.sessions[sid] = [];
		}
	}
}