/**
 * Component for master.
 */
import { Master } from '../master/master';
import { Application } from '../application';

/**
* Master component class
*/
export class Component implements IComponent {
	static _name = '__master__'
	master: Master

	constructor(app: Application, opts?: IConsoleServiceOpts) {
		this.master = new Master(app, opts);
	}

	/**
	 * Component lifecycle function
	 * @param  cb
	 */
	start(cb: Callback<void>) {
		this.master.start(cb);
	}

	/**
	 * Component lifecycle function
	 * @param   force whether stop the component immediately
	 * @param   cb
	 */
	stop(force: boolean, cb: Callback<void>) {
		this.master.stop(cb);
	}

}
