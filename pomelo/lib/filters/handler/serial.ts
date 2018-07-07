/**
 * Filter to keep request sequence.
 */
import taskManager = require('../../common/manager/taskManager');
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

type ISessionForFilter = (IFrontendSession | IBackendSession) & {__serialTask__: taskManager.Task}

export class Filter implements IFilter {
	timeout: number

	constructor(timeout: number) {
		this.timeout = timeout;
	}

	/**
	 * request serialization after filter
	 */
	before(msg: IMessage | IBackendMessage, session: ISessionForFilter, next: HandlerCb) {
		taskManager.addTask(session.id, function (task) {
			session.__serialTask__ = task;
			next();
		}, function () {
			logger.error('[serial filter] msg timeout, msg:' + JSON.stringify(msg));
		}, this.timeout);
	}

	/**
	 * request serialization after filter
	 */
	after(err: AnyErr, msg: IMessage | IBackendMessage, session: ISessionForFilter, resp: IRespMessage, next: Callback<void>) {
		var task: taskManager.Task = session.__serialTask__;
		if (task) {
			if (!task.done() && !err) {
				err = new Error('task time out. msg:' + JSON.stringify(msg));
			}
		}
		next(err);
	}

}
