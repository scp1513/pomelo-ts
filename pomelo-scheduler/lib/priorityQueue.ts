/**
 * The PriorityQeueu class
 */
export class PriorityQueue<T> {
	_comparator: (a: T, b: T) => boolean
	_queue: T[] = []
	_tailPos = 0

	constructor(comparator?: (a: T, b: T) => boolean) {
		this._comparator = typeof comparator == 'function' ? comparator : this._defaultComparator;
	}


	/**
	 * Return the size of the pirority queue
	 * @return PirorityQueue size
	 */
	size() {
		return this._tailPos;
	}

	/**
	 * Insert an element to the queue
	 * @param element The element to insert
	 */
	offer(element: T) {
		var queue = this._queue;
		var compare = this._comparator;

		queue[this._tailPos++] = element;

		var pos = this._tailPos - 1;

		while (pos > 0) {
			var parentPos = (pos % 2 == 0) ? (pos / 2 - 1) : (pos - 1) / 2;
			if (compare(queue[parentPos], element)) {
				queue[pos] = queue[parentPos];
				queue[parentPos] = element;

				pos = parentPos;
			} else {
				break;
			}
		}
	}

	/**
	 * Get and remove the first element in the queue
	 * @return The first element
	 */
	pop() {
		var queue = this._queue;
		var compare = this._comparator;

		if (this._tailPos == 0)
			return null;


		var headNode = queue[0];

		var tail = queue[this._tailPos - 1];

		var pos = 0;
		var left = pos * 2 + 1;
		var right = left + 1;
		queue[pos] = tail;
		this._tailPos--;

		while (left < this._tailPos) {
			if (right < this._tailPos && compare(queue[left], queue[right]) && compare(queue[pos], queue[right])) {
				queue[pos] = queue[right];
				queue[right] = tail;

				pos = right;
			} else if (compare(queue[pos], queue[left])) {
				queue[pos] = queue[left];
				queue[left] = tail;

				pos = left;
			} else {
				break;
			}

			left = pos * 2 + 1;
			right = left + 1;
		}

		return headNode;
	}

	/**
	 * Get but not remove the first element in the queue
	 * @return The first element
	 */
	peek() {
		if (this._tailPos == 0)
			return null;
		return this._queue[0];
	}

	_defaultComparator(a: T, b: T) {
		return a > b;
	}

}
