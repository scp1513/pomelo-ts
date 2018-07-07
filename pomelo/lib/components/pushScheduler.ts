/**
 * Scheduler component to schedule message sending.
 */
import { Scheduler as DefaultScheduler } from '../pushSchedulers/direct'
import { Application } from '../application'

export class Component implements IComponent {
	static _name = '__pushScheduler__'
	app: Application
	scheduler: IScheduler | { [key: string]: IScheduler } = null
	selector: (reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: (id: string) => void) => void
	isSelectable: boolean = null

	constructor(app: Application, opts?: IPushSchedulerOpts) {
		this.app = app;
		opts = opts || {};
		this.scheduler = this.getScheduler(app, opts);
	}

	/**
	 * Component lifecycle callback
	 * @param cb
	 */
	afterStart(cb: (err?: AnyErr) => void) {
		if (this.isSelectable) {
			let schedulers = <{ [key: string]: IScheduler }>this.scheduler
			for (var k in schedulers) {
				var sch = schedulers[k];
				if (typeof sch.start === 'function') {
					sch.start();
				}
			}
			process.nextTick(cb);
		} else {
			let scheduler = <IScheduler>this.scheduler;
			if (typeof scheduler.start === 'function') {
				scheduler.start(cb);
			} else {
				process.nextTick(cb);
			}
		}
	}

	/**
	 * Component lifecycle callback
	 * @param cb
	 */
	stop(force: boolean, cb: (err?: AnyErr) => void) {
		if (this.isSelectable) {
			let schedulers = <{ [key: string]: IScheduler }>this.scheduler
			for (var k in schedulers) {
				var sch = schedulers[k];
				if (typeof sch.stop === 'function') {
					sch.stop(force);
				}
			}
			process.nextTick(cb);
		} else {
			let scheduler = <IScheduler>this.scheduler;
			if (typeof scheduler.stop === 'function') {
				scheduler.stop(force, cb);
			} else {
				process.nextTick(cb);
			}
		}
	}

	/**
	 * Schedule how the message to send.
	 *
	 * @param  reqId request id
	 * @param  route route string of the message
	 * @param  msg   message content after encoded
	 * @param  recvs array of receiver's session id
	 * @param  opts  options
	 * @param  cb
	 */
	schedule(reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: Callback<void>) {
		if (this.isSelectable) {
			this.selector(reqId, route, msg, recvs, opts, (id) => {
				let schedulers = <{ [key: string]: IScheduler }>this.scheduler
				schedulers[id].schedule(reqId, route, msg, recvs, opts, cb);
			});
		} else {
			let scheduler = <IScheduler>this.scheduler;
			scheduler.schedule(reqId, route, msg, recvs, opts, cb);
		}
	}

	private getScheduler(app: Application, opts: IPushSchedulerOpts) {
		var scheduler = opts.scheduler || DefaultScheduler as ISchedulerConstructor
		if (Array.isArray(scheduler)) {
			var res: { [key: string]: IScheduler } = {};
			scheduler.forEach(function (sch) {
				if (typeof sch.scheduler === 'function') {
					res[sch.id] = new sch.scheduler(app, sch.options);
				} else {
					res[sch.id] = sch.scheduler;
				}
			});
			this.isSelectable = true;
			this.selector = opts.selector;
			return res;
		} else if (typeof scheduler === 'function'){
			return new scheduler(app, opts)
		} else {
			return scheduler;
		}
	}

}
