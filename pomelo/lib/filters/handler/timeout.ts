/**
 * Filter for timeout.
 * Print a warn information when request timeout.
 */
import utils = require('../../util/utils');
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

type ISessionForFilter = (IFrontendSession | IBackendSession) & {__timeout__: number}

export class Filter implements IFilter {
	static readonly DEFAULT_TIMEOUT = 3000;
	static readonly DEFAULT_SIZE = 500;
	
	timeout: number
	maxSize: number
	timeouts: {[id: number]: NodeJS.Timer} = {}
	curId = 0

	constructor(timeout?: number, maxSize?: number) {
		this.timeout = timeout || Filter.DEFAULT_TIMEOUT
		this.maxSize = maxSize || Filter.DEFAULT_SIZE
	}

	before(msg: IMessage | IBackendMessage, session: ISessionForFilter, next: HandlerCb) {
		var count = utils.size(this.timeouts);
		if (count > this.maxSize) {
			logger.warn('timeout filter is out of range, current size is %s, max size is %s', count, this.maxSize);
			next();
			return;
		}
		++this.curId;
		this.timeouts[this.curId] = setTimeout(function () {
			var route = (<IBackendMessage>msg).__route__ || (<IMessage>msg).route;
			logger.error('request %j timeout.', route);
		}, this.timeout);
		session.__timeout__ = this.curId;
		next();
	}

	after(err: AnyErr, msg: IMessage | IBackendMessage, session: ISessionForFilter, resp: IRespMessage, next: Callback<void>) {
		var timeout = this.timeouts[session.__timeout__];
		if (timeout) {
			clearTimeout(timeout);
			delete this.timeouts[session.__timeout__];
		}
		next(err);
	}

}
