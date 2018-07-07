import sequeue = require('seq-queue');

export { Task } from 'seq-queue'

let queues: { [key: string]: sequeue.SeqQueue } = {};

export let timeout = 3000;

/**
 * Add tasks into task group. Create the task group if it dose not exist.
 *
 * @param  key       task key
 * @param  fn        task callback
 * @param  ontimeout task timeout callback
 * @param  timeout   timeout for task
 */
export function addTask(key: string | number, fn: (task: sequeue.Task) => void, ontimeout: () => void, timeout: number) {
	let queue = queues[key];
	if (!queue) {
		queue = sequeue.createQueue(timeout);
		queues[key] = queue;
	}

	return queue.push(fn, ontimeout, timeout);
}

/**
 * Destroy task group
 *
 * @param  key   task key
 * @param  force whether close task group directly
 */
export function closeQueue(key: string | number, force: boolean) {
	if (!queues[key]) {
		// ignore illeagle key
		return;
	}

	queues[key].close(force);
	delete queues[key];
}
