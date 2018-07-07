import { SessionService } from '../common/service/sessionService';
import { Application } from '../application';

/**
 * Session component. Manage sessions.
 *
 * @param {Object} app  current application context
 * @param {Object} opts attach parameters
 */
export class Component extends SessionService implements IComponent {
	static _name = '__session__'
	app: Application

	constructor(app: Application, opts?: ISessionServiceOpts) {
		super(opts)
		this.app = app;

		app.set('sessionService', this, true);
	}

	start(cb: Callback<void>) {
		process.nextTick(cb);
	}
}
