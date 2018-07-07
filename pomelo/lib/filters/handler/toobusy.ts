/**
 * Filter for toobusy.
 * if the process is toobusy, just skip the new request
 */
var conLogger = require('pomelo-logger').getLogger('con-log', __filename);
var toobusy: any = null;

type ISessionForFilter = (IFrontendSession | IBackendSession) & {__timeout__: number}

export class Filter implements IFilter {
	static readonly DEFAULT_MAXLAG = 70

	constructor(maxLag: number) {
		try {
			toobusy = require('toobusy');
		} catch (e) {
		}
		if (!!toobusy) {
			toobusy.maxLag(maxLag || Filter.DEFAULT_MAXLAG);
		}
	}

	before(msg: IMessage | IBackendMessage, session: ISessionForFilter, next: HandlerCb) {
		if (!!toobusy && toobusy()) {
			conLogger.warn('[toobusy] reject request msg: ' + msg);
			var err = new Error('Server toobusy!');
			err.code = 500;
			next(err);
		} else {
			next();
		}
	}

}
