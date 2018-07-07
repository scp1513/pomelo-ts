import { Application } from "../application";
import {BackendSessionService} from '../common/service/backendSessionService';

export class Component extends BackendSessionService implements IComponent {
	static _name = '__backendSession__'

	constructor(app: Application) {
		super(app)
		// export backend session service to the application context.
		app.set('backendSessionService', this, true)
	}

	start(cb: Callback<void>) {
		process.nextTick(cb)
	}

}
