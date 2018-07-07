/**
 * Component for monitor.
 * Load and start monitor client.
 */
import { Monitor } from '../monitor/monitor';
import { Application } from '../application';

export class Component implements IComponent {
	static _name = '__monitor__'
	monitor: Monitor

	constructor(app: Application, opts?: IMonitorOpts) {
		this.monitor = new Monitor(app, opts);
	}

	start(cb: Callback<void>) {
		this.monitor.start(cb);
	}

	stop(force: boolean, cb: Callback<void>) {
		this.monitor.stop(cb);
	}

	reconnect(masterInfo: IMasterInfo) {
		this.monitor.reconnect(masterInfo);
	}

}
