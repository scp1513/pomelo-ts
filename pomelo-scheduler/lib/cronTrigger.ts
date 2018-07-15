/**
 * This is the trigger used to decode the cronTimer and calculate the next excution time of the cron Trigger.
 */
import { Job } from './job'

var logger = require('log4js').getLogger(__filename);

var SECOND = 0;
var MIN = 1;
var HOUR = 2;
var DOM = 3;
var MONTH = 4;
var DOW = 5;

var Limit: [number, number][] = [[0, 59], [0, 59], [0, 24], [1, 31], [0, 11], [0, 6]];

/**
 * The constructor of the CronTrigger
 * @param trigger The trigger str used to build the cronTrigger instance
 */
export class CronTrigger<T> {
	job: Job<T>
	trigger: (-1 | number[])[]
	nextTime: number

	constructor(trigger: string, job: Job<T>) {
		this.trigger = this.decodeTrigger(trigger);

		this.nextTime = this.nextExcuteTime(Date.now());

		this.job = job;
	}

	/**
	 * Get the current excuteTime of trigger
	 */
	excuteTime() {
		return this.nextTime;
	}

	/**
	 * Caculate the next valid cronTime after the given time
	 * @param The given time point
	 * @return The nearest valid time after the given time point
	 */
	nextExcuteTime(time?: number): number {
		//add 1s to the time so it must be the next time
		time = !!time ? time : this.nextTime;
		time += 1000;

		var cronTrigger = this.trigger;
		var date = new Date(time);
		date.setMilliseconds(0);

		outmost:
		while (true) {
			if (date.getFullYear() > 2999) {
				logger.error("Can't compute the next time, exceed the limit");
				return null;
			}
			if (!this.timeMatch(date.getMonth(), cronTrigger[MONTH])) {
				var nextMonth = this.nextCronTime(date.getMonth(), cronTrigger[MONTH]);

				if (nextMonth == null)
					return null;

				if (nextMonth <= date.getMonth()) {
					date.setFullYear(date.getFullYear() + 1);
					date.setMonth(0);
					date.setDate(1);
					date.setHours(0);
					date.setMinutes(0);
					date.setSeconds(0);
					continue;
				}

				date.setDate(1);
				date.setMonth(nextMonth);
				date.setHours(0);
				date.setMinutes(0);
				date.setSeconds(0);
			}

			if (!this.timeMatch(date.getDate(), cronTrigger[DOM]) || !this.timeMatch(date.getDay(), cronTrigger[DOW])) {
				var domLimit = this.getDomLimit(date.getFullYear(), date.getMonth());

				do {
					var nextDom = this.nextCronTime(date.getDate(), cronTrigger[DOM]);
					if (nextDom == null)
						return null;

					//If the date is in the next month, add month
					if (nextDom <= date.getDate() || nextDom > domLimit) {
						date.setDate(1);
						date.setMonth(date.getMonth() + 1);
						date.setHours(0);
						date.setMinutes(0);
						date.setSeconds(0);
						continue outmost;
					}

					date.setDate(nextDom);
				} while (!this.timeMatch(date.getDay(), cronTrigger[DOW]));

				date.setHours(0);
				date.setMinutes(0);
				date.setSeconds(0);
			}

			if (!this.timeMatch(date.getHours(), cronTrigger[HOUR])) {
				var nextHour = this.nextCronTime(date.getHours(), cronTrigger[HOUR]);

				if (nextHour <= date.getHours()) {
					date.setDate(date.getDate() + 1);
					date.setHours(nextHour);
					date.setMinutes(0);
					date.setSeconds(0);
					continue;
				}

				date.setHours(nextHour);
				date.setMinutes(0);
				date.setSeconds(0);
			}

			if (!this.timeMatch(date.getMinutes(), cronTrigger[MIN])) {
				var nextMinute = this.nextCronTime(date.getMinutes(), cronTrigger[MIN]);

				if (nextMinute <= date.getMinutes()) {
					date.setHours(date.getHours() + 1);
					date.setMinutes(nextMinute);
					date.setSeconds(0);
					continue;
				}

				date.setMinutes(nextMinute);
				date.setSeconds(0);
			}

			if (!this.timeMatch(date.getSeconds(), cronTrigger[SECOND])) {
				var nextSecond = this.nextCronTime(date.getSeconds(), cronTrigger[SECOND]);

				if (nextSecond <= date.getSeconds()) {
					date.setMinutes(date.getMinutes() + 1);
					date.setSeconds(nextSecond);
					continue;
				}

				date.setSeconds(nextSecond);
			}
			break;
		}

		this.nextTime = date.getTime();
		return this.nextTime;
	}

	/**
	 * Decude the cronTrigger string to arrays
	 * @param cronTimeStr The cronTimeStr need to decode, like "0 12 * * * 3"
	 * @return The array to represent the cronTimer
	 */
	decodeTrigger(cronTimeStr: string): (-1 | number[])[] {
		var cronTimes = cronTimeStr.split(/\s+/);

		if (cronTimes.length != 6) {
			console.log('error');
			return null;
		}

		let array = new Array<-1 | number[]>(cronTimes.length)
		for (var i = 0; i < cronTimes.length; i++) {
			array[i] = this.decodeTimeStr(cronTimes[i], i);

			if (!this.checkNum(array[i], Limit[i][0], Limit[i][1])) {
				logger.error('Decode crontime error, value exceed limit!' +
					JSON.stringify({ cronTime: array[i], limit: Limit[i] }));
				return null;
			}
		}

		return array;
	}

	/**
	 * Decode the cron Time string
	 * @param timeStr The cron time string, like: 1,2 or 1-3
	 * @return A sorted array, like [1,2,3]
	 */
	decodeTimeStr(timeStr: string, type: number): -1 | number[] {
		var result: { [key: number]: number } = {};
		var arr: number[] = [];

		if (timeStr == '*') {
			return -1;
		} else if (timeStr.search(',') > 0) {
			var timeArr = timeStr.split(',');
			for (var i = 0; i < timeArr.length; i++) {
				var time = timeArr[i];
				if (time.match(/^\d+-\d+$/)) {
					this.decodeRangeTime(result, time);
				} else if (time.match(/^\d+\/\d+/)) {
					this.decodePeriodTime(result, time, type);
				} else if (!isNaN(Number(time))) {
					var num = Number(time);
					result[num] = num;
				} else
					return null;
			}
		} else if (timeStr.match(/^\d+-\d+$/)) {
			this.decodeRangeTime(result, timeStr);
		} else if (timeStr.match(/^\d+\/\d+/)) {
			this.decodePeriodTime(result, timeStr, type);
		} else if (!isNaN(Number(timeStr))) {
			var num = Number(timeStr);
			result[num] = num;
		} else {
			return null;
		}

		for (var key in result) {
			arr.push(result[key]);
		}

		arr.sort(function (a, b) {
			return a - b;
		});

		return arr;
	}

	/**
	 * return the next match time of the given value
	 * @param value The time value
	 * @param cronTime The cronTime need to match
	 * @return The match value or null if unmatch(it offten means an error occur).
	 */
	private nextCronTime(value: number, cronTime: number | number[]) {
		value += 1;

		if (typeof (cronTime) == 'number') {
			if (cronTime == -1)
				return value;
			else
				return cronTime;
		} else if (cronTime instanceof Array) {
			if (value <= cronTime[0] || value > cronTime[cronTime.length - 1])
				return cronTime[0];

			for (var i = 0; i < cronTime.length; i++)
				if (value <= cronTime[i])
					return cronTime[i];
		}

		logger.warn('Compute next Time error! value :' + value + ' cronTime : ' + cronTime);
		return null;
	}

	/**
	 * Match the given value to the cronTime
	 * @param value The given value
	 * @param cronTime The cronTime
	 * @return The match result
	 */
	private timeMatch(value: number, cronTime: number | number[]) {
		if (typeof cronTime === 'number') {
			if (cronTime == -1)
				return true;
			if (value == cronTime)
				return true;
			return false;
		} else if (cronTime instanceof Array) {
			if (value < cronTime[0] || value > cronTime[cronTime.length - 1])
				return false;

			for (var i = 0; i < cronTime.length; i++)
				if (value == cronTime[i])
					return true;

			return false;
		}

		return null;
	}

	/**
	 * Decode time range
	 * @param map The decode map
	 * @param timeStr The range string, like 2-5
	 */
	private decodeRangeTime(map: { [key: number]: number }, timeStr: string) {
		var times = timeStr.split('-');

		let time0 = Number(times[0]);
		let time1 = Number(times[1]);
		if (time0 > time1) {
			console.log("Error time range");
			return;
		}

		for (var i = time0; i <= time1; i++) {
			map[i] = i;
		}
	}

	/**
	 * Compute the period timer
	 */
	private decodePeriodTime(map: { [key: number]: number }, timeStr: string, type: number) {
		var times = timeStr.split('/');
		var min = Limit[type][0];
		var max = Limit[type][1];

		var remind = Number(times[0]);
		var period = Number(times[1]);

		if (period == 0)
			return;

		for (var i = min; i <= max; i++) {
			if (i % period == remind)
				map[i] = i;
		}
	}

	/**
	 * Check if the numbers are valid
	 * @param nums The numbers array need to check
	 * @param min Minimus value
	 * @param max Maximam value
	 * @return If all the numbers are in the data range
	 */
	private checkNum(nums: -1 | number[], min: number, max: number) {
		if (nums === null)
			return false;

		if (nums === -1)
			return true;

		for (var i = 0; i < nums.length; i++) {
			if (nums[i] < min || nums[i] > max)
				return false;
		}

		return true;
	}

	/**
	 * Get the date limit of given month
	 * @param The given year
	 * @month The given month
	 * @return The date count of given month
	 */
	private getDomLimit(year: number, month: number) {
		var date = new Date(year, month + 1, 0);

		return date.getDate();
	}

}
