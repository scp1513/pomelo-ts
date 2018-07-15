/**
 * This is the class of the job used in schedule module
 */
import { CronTrigger } from './cronTrigger'
import { SimpleTrigger, ITriggerObj } from './simpleTrigger'

export { ITriggerObj } from './simpleTrigger'

var jobId = 1;

var SIMPLE_JOB = 1;
var CRON_JOB = 2;
var jobCount = 0;

var warnLimit = 500;

var logger = require('log4js').getLogger(__filename);


//For test
var lateCount = 0;

export class Job<T> {
	id: number
	runTime = 0
	type: number
	data: T
	func: (data: T) => void
	trigger: CronTrigger<T>|SimpleTrigger<T>

	/**
	 * The Interface to create Job
	 * @param trigger The trigger to use
	 * @param jobFunc The function the job to run
	 * @param jobDate The date the job use
	 * @return The new instance of the give job or null if fail
	 */
	constructor(trigger: string|ITriggerObj, jobFunc: (data: T) => void, jobData?: T) {
		this.data = (!!jobData) ? jobData : null;
		this.func = jobFunc;

		if (typeof trigger === 'string') {
			this.type = CRON_JOB;
			this.trigger = new CronTrigger(trigger, this);
		} else if (typeof trigger === 'object') {
			this.type = SIMPLE_JOB;
			this.trigger = new SimpleTrigger(trigger, this);
		}

		this.id = jobId++;
	}

	/**
	 * Run the job code
	 */
	run() {
		try {
			jobCount++;
			this.runTime++;
			var late = Date.now() - this.excuteTime();
			if (late > warnLimit)
				logger.warn('run Job count ' + jobCount + ' late :' + late + ' lateCount ' + (++lateCount));
			this.func(this.data);
		} catch (e) {
			logger.error("Job run error for exception ! " + e.stack);
		}
	}

	/**
	 * Compute the next excution time
	 */
	nextTime() {
		return this.trigger.nextExcuteTime();
	}

	excuteTime() {
		return this.trigger.excuteTime();
	}
}
