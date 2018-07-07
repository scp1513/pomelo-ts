/**
 * Filter for rpc log.
 * Record used time for remote process call.
 */
var rpcLogger = require('pomelo-logger').getLogger('rpc-log', __filename);
var utils = require('../../util/utils');

export class Filter implements IRpcFilter {
	constructor() {
	}

	/**
	 * Before filter for rpc
	 */

	before(serverId: ServerId, msg, opts, next) {
		opts = opts || {};
		opts.__start_time__ = Date.now();
		next();
	}

	/**
	 * After filter for rpc
	 */
	after(serverId: ServerId, msg, opts, next) {
		if (!!opts && !!opts.__start_time__) {
			var start = opts.__start_time__;
			var end = Date.now();
			var timeUsed = end - start;
			var log = {
				route: msg.serverType + '.' + msg.service + '.' + msg.method,
				args: msg.args,
				time: utils.format(new Date(start)),
				timeUsed: timeUsed
			};
			rpcLogger.debug(JSON.stringify(log));
		}
		next();
	}

}
