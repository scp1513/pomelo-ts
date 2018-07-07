/**
 * Filter for statistics.
 * Record used time for each request.
 */
import utils = require('../../util/utils');
var conLogger = require('pomelo-logger').getLogger('con-log', __filename);

type ISessionForFilter = (IFrontendSession | IBackendSession) & {__startTime__: number}

export class Filter implements IFilter {
	constructor() {
	}

	before(msg: IMessage | IBackendMessage, session: ISessionForFilter, next: HandlerCb) {
		session.__startTime__ = Date.now();
		next();
	}

	after(err: AnyErr, msg: IMessage | IBackendMessage, session: ISessionForFilter, resp: IRespMessage, next: Callback<void>) {
		var start = session.__startTime__;
		if (typeof start === 'number') {
			var timeUsed = Date.now() - start;
			var route = (<IBackendMessage>msg).__route__ || (<IMessage>msg).route;
			var log = {
				route: route,
				args: msg,
				time: utils.format(new Date(start)),
				timeUsed: timeUsed
			};
			conLogger.info(JSON.stringify(log));
		}
		next(err);
	}

}
