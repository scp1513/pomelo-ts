import { PriorityQueue } from './priorityQueue'
import { Job, ITriggerObj } from './job'

var map: {[id: number]: Job<any>} = {}
var queue = new PriorityQueue(comparator);
var timer: NodeJS.Timer;

interface IQueElem {
	id: number
	time: number
}

//The accuracy of the scheduler, it will affect the performance when the schedule tasks are
//crowded together
var accuracy = 10;

/**
 * Schedule a new Job
 */
export function scheduleJob<T>(trigger: string|ITriggerObj, jobFunc: (data: T) => void, jobData?: T) {
	var job = new Job(trigger, jobFunc, jobData);
	var excuteTime = job.excuteTime();
	var id = job.id;

	map[id] = job;
	var element = {
		id: id,
		time: excuteTime
	};

	var curJob = queue.peek();
	if (!curJob || excuteTime < curJob.time) {
		queue.offer(element);
		setTimer(job);

		return job.id;
	}

	queue.offer(element);
	return job.id;
}

/**
 * Cancel Job
 */
export function cancelJob(id: number) {
	var curJob = queue.peek();
	if (curJob && id === curJob.id) { // to avoid queue.peek() is null
		queue.pop();
		delete map[id];

		clearTimeout(timer);
		excuteJob();
	}
	delete map[id];
	return true;
}

/**
 * Clear last timeout and schedule the next job, it will automaticly run the job that
 * need to run now
 * @param job The job need to schedule
 * @return void
 */
function setTimer<T>(job: Job<T>) {
	clearTimeout(timer);

	timer = setTimeout(excuteJob, job.excuteTime() - Date.now());
}

/**
 * The function used to ran the schedule job, and setTimeout for next running job
 */
function excuteJob() {
	var job = peekNextJob();

	while (!!job && (job.excuteTime() - Date.now()) < accuracy) {
		job.run();
		queue.pop();

		var nextTime = job.nextTime();

		if (nextTime === null) {
			delete map[job.id];
		} else {
			queue.offer({ id: job.id, time: nextTime });
		}
		job = peekNextJob();
	}

	//If all the job have been canceled
	if (!job)
		return;

	//Run next schedule
	setTimer(job);
}

/**
 * Return, but not remove the next valid job
 * @return Next valid job
 */
function peekNextJob() {
	if (queue.size() <= 0)
		return null;

	var job = null;

	do {
		job = map[queue.peek().id];
		if (!job) queue.pop();
	} while (!job && queue.size() > 0);

	return (!!job) ? job : null;
}

function comparator(e1: IQueElem, e2: IQueElem) {
	return e1.time > e2.time;
}
