import { Package } from '../../../../pomelo-protocol';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

/**
 * Process heartbeat request.
 *
 * @param {Object} opts option request
 *                      opts.heartbeat heartbeat interval
 */
export class Command {
	heartbeat: number = null
	timeout: number = null
	disconnectOnTimeout: boolean
	timeouts: { [socketId: number]: NodeJS.Timer } = {}
	clients: { [socketId: number]: number } = {}

	constructor(opts: {disconnectOnTimeout?: boolean, heartbeat?: number, timeout?: number}) {
		this.disconnectOnTimeout = !!opts.disconnectOnTimeout;
		if (opts.heartbeat) {
			this.heartbeat = opts.heartbeat * 1000; // heartbeat interval
			this.timeout = opts.timeout * 1000 || this.heartbeat * 2;      // max heartbeat message timeout
			this.disconnectOnTimeout = true;
		}
	}

	handle(socket: IPomeloSocket) {
		if (!this.heartbeat) {
			// no heartbeat setting
			return;
		}

		if (!this.clients[socket.id]) {
			// clear timers when socket disconnect or error
			this.clients[socket.id] = 1;
			socket.once('disconnect', () => this.clearTimers(socket.id));
			socket.once('error', () => this.clearTimers(socket.id));
		}

		// clear timeout timer
		if (this.disconnectOnTimeout) {
			this.clear(socket.id);
		}

		socket.sendRaw(Package.encode(Package.TYPE_HEARTBEAT));

		if (this.disconnectOnTimeout) {
			this.timeouts[socket.id] = setTimeout(function () {
				logger.info('client %j heartbeat timeout.', socket.id);
				socket.disconnect();
			}, this.timeout);
		}
	}

	clear(id: number) {
		var tid = this.timeouts[id];
		if (tid) {
			clearTimeout(tid);
			delete this.timeouts[id];
		}
	}

	private clearTimers(id: number) {
		delete this.clients[id];
		var tid = this.timeouts[id];
		if (tid) {
			clearTimeout(tid);
			delete this.timeouts[id];
		}
	}

}
