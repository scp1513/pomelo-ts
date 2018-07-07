import os = require('os');
import util = require('util');
import { exec } from 'child_process';
import Constants = require('./constants');
import pomelo = require('../pomelo');
import { Application } from '../application';
let logger = require('pomelo-logger').getLogger('pomelo', __filename);

/**
 * Invoke callback with check
 */
export function invokeCallback(cb: Function, ...p: any[]) {
	if (typeof cb === 'function') {
		let len = arguments.length;
		if (len == 1) {
			return cb();
		}
		if (len == 2) {
			return cb(arguments[1]);
		}
		if (len == 3) {
			return cb(arguments[1], arguments[2]);
		}
		if (len == 4) {
			return cb(arguments[1], arguments[2], arguments[3]);
		}
		let args = new Array(len - 1);
		for (let i = 1; i < len; i++) {
			args[i - 1] = arguments[i];
		}
		cb.apply(null, args);
	}
}

/**
 * Get the count of elements of object
 */
export function size<T extends Object>(obj: T) {
	var count = 0;
	for (var i in obj) {
		if (obj.hasOwnProperty(i) && typeof obj[i] !== 'function') {
			count++;
		}
	}
	return count;
}

/**
 * Check a string whether ends with another string
 */
export function endsWith(str: string, suffix: string): boolean {
	if (suffix.length > str.length) {
		return false;
	}
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

/**
 * Check a string whether starts with another string
 */
export function startsWith(str: string, prefix: string) {
	if (prefix.length > str.length) {
		return false;
	}

	return str[0] === prefix[0] && str.indexOf(prefix) === 0;
}

/**
 * Compare the two arrays and return the difference.
 */
export function arrayDiff(array1: (string | number)[], array2: (string | number)[]) {
	let o: { [key: string]: boolean } = {};
	for (let i = 0, len = array2.length; i < len; i++) {
		o[array2[i]] = true;
	}

	let result = [];
	for (let i = 0, len = array1.length; i < len; i++) {
		let v = array1[i];
		if (o[v]) continue;
		result.push(v);
	}
	return result;
}

/*
 * Date format
 */
export function format(date: Date, format?: string) {
	if (format) {
		let o: { [key: string]: number } = {
			"M+": date.getMonth() + 1, //month
			"d+": date.getDate(), //day
			"h+": date.getHours(), //hour
			"m+": date.getMinutes(), //minute
			"s+": date.getSeconds(), //second
			"q+": Math.floor((date.getMonth() + 3) / 3), //quarter
			"S": date.getMilliseconds() //millisecond
		};

		if (/(y+)/.test(format)) {
			format = format.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
		}

		for (let k in o) {
			if (new RegExp("(" + k + ")").test(format)) {
				format = format.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k].toString() :
					("00" + o[k]).substr(("" + o[k]).length));
			}
		}
		return format;
	} else {
		let M = date.getMonth() + 1;
		let d = date.getDate();
		let h = date.getHours();
		let m = date.getMinutes();

		return '' + (M < 10 ? '0' + M : M) + (d < 10 ? '0' + d : d) + (h < 10 ? '0' + h : h) + (m < 10 ? '0' + m : m);
	}
}

/**
 * check if has Chinese characters.
 */
export function hasChineseChar(str: string) {
	if (/.*[\u4e00-\u9fa5]+.*$/.test(str)) {
		return true;
	} else {
		return false;
	}
}

/**
 * transform unicode to utf8
 */
export function unicodeToUtf8(str: string) {
	var i, len, ch;
	var utf8Str = "";
	len = str.length;
	for (i = 0; i < len; i++) {
		ch = str.charCodeAt(i);

		if ((ch >= 0x0) && (ch <= 0x7F)) {
			utf8Str += str.charAt(i);
		} else if ((ch >= 0x80) && (ch <= 0x7FF)) {
			utf8Str += String.fromCharCode(0xc0 | ((ch >> 6) & 0x1F));
			utf8Str += String.fromCharCode(0x80 | (ch & 0x3F));
		} else if ((ch >= 0x800) && (ch <= 0xFFFF)) {
			utf8Str += String.fromCharCode(0xe0 | ((ch >> 12) & 0xF));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 6) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | (ch & 0x3F));
		} else if ((ch >= 0x10000) && (ch <= 0x1FFFFF)) {
			utf8Str += String.fromCharCode(0xF0 | ((ch >> 18) & 0x7));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 12) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 6) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | (ch & 0x3F));
		} else if ((ch >= 0x200000) && (ch <= 0x3FFFFFF)) {
			utf8Str += String.fromCharCode(0xF8 | ((ch >> 24) & 0x3));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 18) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 12) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 6) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | (ch & 0x3F));
		} else if ((ch >= 0x4000000) && (ch <= 0x7FFFFFFF)) {
			utf8Str += String.fromCharCode(0xFC | ((ch >> 30) & 0x1));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 24) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 18) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 12) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | ((ch >> 6) & 0x3F));
			utf8Str += String.fromCharCode(0x80 | (ch & 0x3F));
		}

	}
	return utf8Str;
}

/**
 * Ping server to check if network is available
 *
 */
export function ping(host: string, cb: (ok: boolean) => void) {
	if (!isLocal(host)) {
		var cmd = 'ping -w 15 ' + host;
		exec(cmd, function (err, stdout, stderr) {
			if (!!err) {
				cb(false);
				return;
			}
			cb(true);
		});
	} else {
		cb(true);
	}
}

/**
 * Check if server is exsit. 
 *
 */
export function checkPort(server: IServerInfo, cb: (result: string) => void) {
	if (!server.port && !server.clientPort) {
		invokeCallback(cb, 'leisure');
		return;
	}
	var port = server.port || server.clientPort;
	var host = server.host;
	var generateCommand = function (host: string, port: number) {
		var cmd;
		var ssh_params = pomelo.app.get<string[]>(Constants.RESERVED.SSH_CONFIG_PARAMS);
		let params: string
		if (!!ssh_params && Array.isArray(ssh_params)) {
			params = ssh_params.join(' ');
		}
		else {
			params = "";
		}
		if (!isLocal(host)) {
			cmd = util.format('ssh %s %s "netstat -an|awk \'{print $4}\'|grep %d|wc -l"', host, params, port);
		} else {
			cmd = util.format('netstat -an|awk \'{print $4}\'|grep %d|wc -l', port);
		}
		return cmd;
	};
	var cmd1 = generateCommand(host, port);
	exec(cmd1, (err, stdout, stderr) => {
		if (err) {
			logger.error('command %s execute with error: %j', cmd1, err.stack);
			invokeCallback(cb, 'error');
		} else if (stdout.trim() !== '0') {
			invokeCallback(cb, 'busy');
		} else {
			port = server.clientPort;
			var cmd2 = generateCommand(host, port);
			exec(cmd2, (err, stdout, stderr) => {
				if (err) {
					logger.error('command %s execute with error: %j', cmd2, err.stack);
					invokeCallback(cb, 'error');
				} else if (stdout.trim() !== '0') {
					invokeCallback(cb, 'busy');
				} else {
					invokeCallback(cb, 'leisure');
				}
			});
		}
	});
}

export function isLocal(host: string) {
	let app = pomelo.app
	if (!app) {
		return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host);
	} else {
		return host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || inLocal(host) || host === app.master.host;
	}
}

function clone<T>(src: T): T {
	let rs: any = {};
	for (let key in src) {
		rs[key] = src[key];
	}
	return rs;
}

/**
 * Load cluster server.
 *
 */
export function loadCluster(app: Application, server: IServerInfo, serverMap: { [id: string]: IServerInfo }) {
	let increaseFields: { [key: string]: string } = {};
	let count = server.clusterCount || 0;
	let seq = app.clusterSeq[server.serverType];
	if (!seq) {
		seq = 0;
		app.clusterSeq[server.serverType] = count;
	} else {
		app.clusterSeq[server.serverType] = seq + count;
	}

	let obj: { [key: string]: string | number | boolean } = <any>server
	for (let key in obj) {
		let value = obj[key].toString();
		if (value.indexOf(Constants.RESERVED.CLUSTER_SIGNAL) > 0) {
			let base = value.slice(0, -2);
			increaseFields[key] = base;
		}
	}

	for (let i = 0, l = seq; i < count; i++ , l++) {
		let cserver = clone(server);
		cserver.id = Constants.RESERVED.CLUSTER_PREFIX + server.serverType + '-' + l;
		for (let k in increaseFields) {
			let v = parseInt(increaseFields[k]);
			(<any>cserver)[k] = v + i;
		}
		serverMap[cserver.id] = cserver;
	}
}

export function headHandler(headBuffer: Buffer) {
	var len = 0;
	for (var i = 1; i < 4; i++) {
		if (i > 1) {
			len <<= 8;
		}
		len += headBuffer.readUInt8(i);
	}
	return len;
}

function inLocal(host: string) {
	for (var index in localIps) {
		if (host === localIps[index]) {
			return true;
		}
	}
	return false;
}

let localIps = (() => {
	let ifaces = os.networkInterfaces()
	let ips: string[] = []
	let func = (details: os.NetworkInterfaceInfo) => {
		if (details.family === 'IPv4') {
			ips.push(details.address)
		}
	}
	for (let dev in ifaces) {
		ifaces[dev].forEach(func)
	}
	return ips;
})()
