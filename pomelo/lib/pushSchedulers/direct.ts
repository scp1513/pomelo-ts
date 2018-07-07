import { Application } from '../application'
import { SessionService } from '../common/service/sessionService'
import { ChannelService } from '../common/service/channelService'
import utils = require('../util/utils')

export class Scheduler implements IScheduler {
	app: Application

	constructor(app: Application, opts: any) {
		this.app = app;
	}

	schedule(reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: Callback<void>) {
		opts = opts || {};
		if (opts.type === 'broadcast') {
			this.doBroadcast(msg, opts.userOptions);
		} else {
			this.doBatchPush(msg, recvs);
		}

		if (cb) {
			process.nextTick(function () {
				utils.invokeCallback(cb);
			});
		}
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

				sessionService.sendMessageByUid(session.uid, msg);
			});
		} else {
			sessionService.forEachSession((session) => {
				if (channelService.broadcastFilter &&
					!channelService.broadcastFilter(session, msg, opts.filterParam)) {
					return;
				}

				sessionService.sendMessage(session.id, msg);
			});
		}
	}

	private doBatchPush(msg: Buffer, recvs: number[]) {
		var sessionService = this.app.get<SessionService>('sessionService');
		for (var i = 0, l = recvs.length; i < l; i++) {
			sessionService.sendMessage(recvs[i], msg);
		}
	}
}