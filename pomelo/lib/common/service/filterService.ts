import { FrontendSession } from "./sessionService";
import { BackendSession } from "./backendSessionService";

var logger = require('pomelo-logger').getLogger('pomelo', __filename);

/**
 * Filter service.
 * Register and fire before and after filters.
 */
export class FilterService {
	befores: IFilter[] = [];    // before filters
	afters: IFilter[] = [];     // after filters

	/**
	 * Add before filter into the filter chain.
	 *
	 * @param filter filter instance or filter function.
	 */
	before(filter: IFilter) {
		this.befores.push(filter);
	}

	/**
	 * Add after filter into the filter chain.
	 *
	 * @param filter filter instance or filter function.
	 */
	after(filter: IFilter) {
		this.afters.unshift(filter);
	}

	/**
	 * TODO: other insert method for filter? such as unshift
	 */

	/**
	 * Do the before filter.
	 * Fail over if any filter pass err parameter to the next function.
	 *
	 * @param msg {Object} clienet request msg
	 * @param session {Object} a session object for current request
	 * @param cb {Function} cb(err) callback function to invoke next chain node
	 */
	beforeFilter(msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, cb: HandlerCb) {
		let index = 0;
		let next: HandlerCb = (err, resp?, opts?) => {
			if (err || index >= this.befores.length) {
				cb(err, resp, opts);
				return;
			}

			let handler = this.befores[index++];
			if (typeof handler.before === 'function') {
				handler.before(msg, session, next);
			} else {
				logger.error('meet invalid before filter, handler or handler.before should be function.');
				next(new Error('invalid before filter.'));
			}
		}

		next(null);
	}

	/**
	 * Do after filter chain.
	 * Give server a chance to do clean up jobs after request responsed.
	 * After filter can not change the request flow before.
	 * After filter should call the next callback to let the request pass to next after filter.
	 *
	 * @param err {Object} error object
	 * @param session {Object} session object for current request
	 * @param {Object} resp response object send to client
	 * @param cb {Function} cb(err) callback function to invoke next chain node
	 */
	afterFilter(err: AnyErr, msg: IMessage|IBackendMessage, session: FrontendSession|BackendSession, resp: IRespMessage, cb: Callback<void>) {
		var index = 0, self = this;
		function next(err: AnyErr) {
			//if done
			if (index >= self.afters.length) {
				cb(err);
				return;
			}

			var handler = self.afters[index++];
			if (typeof handler.after === 'function') {
				handler.after(err, msg, session, resp, next);
			} else {
				logger.error('meet invalid after filter, handler or handler.after should be function.');
				next(new Error('invalid after filter.'));
			}
		} //end of next

		next(err);
	}

}
