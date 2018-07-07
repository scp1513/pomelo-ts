import { Application } from "../application";
import { ConnectionService } from '../common/service/connectionService';

/**
 * Connection component for statistics connection status of frontend servers
 */
export class Component extends ConnectionService implements IComponent {
	static _name = '__connection__';
	app: Application

	constructor(app: Application) {
		super(app)
		this.app = app;
	}

	start(cb: Callback<void>) {
		process.nextTick(cb)
	}
}
