import countDownLatch = require('../../util/countDownLatch');
import utils = require('../../util/utils');
import { Session } from './sessionService';
import { Remote as ChannelRemote } from '../remote/frontend/channelRemote';
import { Application } from '../../application';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

/**
 * constant
 */
var ST_INITED = 0;
var ST_DESTROYED = 1;

export interface IChannelServiceOpts {
	prefix?: string
	store?: IChannelServiceStore
	broadcastFilter?: (session: Session, msg: Buffer, params) => void
}

/**
 * Create and maintain channels for server local.
 *
 * ChannelService is created by channel component which is a default loaded
 * component of pomelo and channel service would be accessed by `app.get('channelService')`.
 *
 * @class
 * @constructor
 */
export class ChannelService {
	app: Application
	channels: { [name: string]: Channel }
	prefix: string
	store: IChannelServiceStore
	broadcastFilter: (session: Session, msg: Buffer, params) => void
	channelRemote: ChannelRemote

	constructor(app: Application, opts?: IChannelServiceOpts) {
		opts = opts || {};
		this.app = app;
		this.channels = {};
		this.prefix = opts.prefix;
		this.store = opts.store;
		this.broadcastFilter = opts.broadcastFilter;
		this.channelRemote = new ChannelRemote(app);
	}

	start(cb: Callback<void>) {
		restoreChannel(this, cb);
	}

	/**
	 * Create channel with name.
	 * @param  name channel's name
	 */
	createChannel(name: string): Channel {
		if (this.channels[name]) {
			return this.channels[name];
		}

		var c = new Channel(name, this);
		addToStore(this, genKey(this), genKey(this, name));
		this.channels[name] = c;
		return c;
	}

	/**
	 * Get channel by name.
	 *
	 * @param {String} name channel's name
	 * @param {Boolean} create if true, create channel
	 * @return {Channel}
	 * @memberOf ChannelService
	 */
	getChannel(name: string, create: boolean) {
		var channel = this.channels[name];
		if (!channel && !!create) {
			channel = this.channels[name] = new Channel(name, this);
			addToStore(this, genKey(this), genKey(this, name));
		}
		return channel;
	}

	/**
	 * Destroy channel by name.
	 *
	 * @param {String} name channel name
	 * @memberOf ChannelService
	 */
	destroyChannel(name: string) {
		delete this.channels[name];
		removeFromStore(this, genKey(this), genKey(this, name));
		removeAllFromStore(this, genKey(this, name));
	}

	/**
	 * Push message by uids.
	 * Group the uids by group. ignore any uid if sid not specified.
	 *
	 * @param {String} route message route
	 * @param {Object} msg message that would be sent to client
	 * @param {Array} uids the receiver info list, [{uid: userId, sid: frontendServerId}]
	 * @param {Object} opts user-defined push options, optional 
	 * @param {Function} cb cb(err)
	 */
	pushMessageByUids(route: string, msg: IRespMessage, uids: {uid: Uid, sid: ServerId}[], opts, cb: Callback<Uid[]>) {
		if (!uids || uids.length === 0) {
			utils.invokeCallback(cb, new Error('uids should not be empty'));
			return;
		}
		let groups: {[sid: string]: Uid[]} = {}, record: {uid: Uid, sid: ServerId};
		for (let i = 0, l = uids.length; i < l; i++) {
			record = uids[i];
			add(record.uid, record.sid, groups);
		}

		sendMessageByGroup(this, route, msg, groups, opts, cb);
	}

	/**
	 * Push message list by uids.
	 * Group the uids by group. ignore any uid if sid not specified.
	 *
	 * @param {String} route message route
	 * @param {Object} msg message that would be sent to client
	 * @param {Array} uids the receiver info list, [{uid: userId, sid: frontendServerId}]
	 * @param {Object} opts user-defined push options, optional 
	 * @param {Function} cb cb(err)
	 * @memberOf ChannelService
	 */
	pushMsgsByUids(msgs: IRespMessageWrap[], uids: {sid: ServerId, uid: Uid}[], opts, cb: Callback<Uid[]>) {
		if (!uids || uids.length === 0) {
			utils.invokeCallback(cb, new Error('uids should not be empty'));
			return;
		}
		var groups: {[sid: string]: Uid[]} = {}
		for (var i = 0, l = uids.length; i < l; i++) {
			let record = uids[i];
			add(record.uid, record.sid, groups);
		}

		this.sendMsgsByGroup(msgs, groups, opts, cb);
	}

	/**
	 * Broadcast message to all the connected clients.
	 *
	 * @param  {String}   stype      frontend server type string
	 * @param  {String}   route      route string
	 * @param  {Object}   msg        message
	 * @param  {Object}   opts       user-defined broadcast options, optional
	 *                               opts.binded: push to binded sessions or all the sessions
	 *                               opts.filterParam: parameters for broadcast filter.
	 * @param  {Function} cb         callback
	 * @memberOf ChannelService
	 */
	broadcast(stype: ServerType, route: string, msg: IRespMessage, opts, cb: Callback<void>) {
		var app = this.app;
		var namespace = 'sys';
		var service = 'channelRemote';
		var method = 'broadcast';
		var servers = app.getServersByType(stype);

		if (!servers || servers.length === 0) {
			// server list is empty
			cb();
			return;
		}

		var count = servers.length;
		var successFlag = false;

		var latch = countDownLatch.createCountDownLatch(count, {}, function () {
			if (!successFlag) {
				cb(new Error('broadcast fails'));
				return;
			}
			cb(null);
		});

		var genCB = function (serverId: ServerId) {
			return function (err: AnyErr) {
				if (err) {
					logger.error('[broadcast] fail to push message to serverId: ' + serverId + ', err:' + err.stack);
					latch.done();
					return;
				}
				successFlag = true;
				latch.done();
			};
		};

		var self = this;
		var sendMessage = function (serverId: ServerId) {
			return (function () {
				if (serverId === app.serverId) {
					self.channelRemote.broadcast(route, msg, opts, genCB(serverId));
				} else {
					app.rpcInvoke(serverId, {
						namespace, service, method, args: [route, msg, opts]
					}, genCB(serverId));
				}
			}());
		};

		opts = { type: 'broadcast', userOptions: opts || {} };

		// for compatiblity 
		opts.isBroadcast = true;
		if (opts.userOptions) {
			opts.binded = opts.userOptions.binded;
			opts.filterParam = opts.userOptions.filterParam;
		}

		for (var i = 0, l = count; i < l; i++) {
			sendMessage(servers[i].id);
		}
	}

	/**
	 * push message by group
	 *
	 * @param route  route route message
	 * @param msg  message that would be sent to client
	 * @param groups  grouped uids, , key: sid, value: [uid]
	 * @param opts  push options
	 * @param cb  cb(err)
	 */
	sendMsgsByGroup(msgs: IRespMessageWrap[], groups: {[sid: string]: Uid[]}, opts, cb: Callback<Uid[]>) {
		var app = this.app;
		var namespace = 'sys';
		var service = 'channelRemote';
		var method = 'pushMsgs';
		var count = utils.size(groups);
		var successFlag = false;
		var failIds: Uid[] = [];

		logger.debug('[%s] channelService sendMessageByGroup msg: %j, groups: %j, opts: %j', app.serverId, msgs, groups, opts);
		if (count === 0) {
			// group is empty
			cb();
			return;
		}

		var latch = countDownLatch.createCountDownLatch(count, {}, function () {
			if (!successFlag) {
				cb(new Error('all uids push message fail'));
				return;
			}
			cb(null, failIds);
		});

		var rpcCB = function (serverId: ServerId) {
			return function (errs: AnyErr|AnyErr[], fails: Uid[]) {
				var hasErr = false;
				if (Array.isArray(errs)) {
					for (var i = 0; i < errs.length; ++i) {
						var err = errs[i];
						if (err) {
							logger.error('[pushMessage] fail to dispatch msg to serverId: ' + serverId + ', err:' + err.stack);
							hasErr = true;
							continue;
						}
					}
				} else if (!!errs) {
					logger.error('[pushMessage] fail to dispatch msg to serverId: ' + serverId + ', err:' + err.stack);
					hasErr = true;
				}
				if (fails) {
					failIds = failIds.concat(fails);
				}
				if (!hasErr) {
					successFlag = true;
				}
				latch.done();
			};
		};

		opts = { type: 'push', userOptions: opts || {} };
		// for compatiblity
		opts.isPush = true;

		var sendMessage = function (sid: ServerId) {
			return (function () {
				if (sid === app.serverId) {
					this.channelRemote.pushMsgs(msgs, groups[sid], opts, rpcCB(sid));
				} else {
					app.rpcInvoke(sid, {
						namespace, service, method, args: [msgs, groups[sid], opts]
					}, rpcCB(sid));
				}
			})();
		};

		for (var sid in groups) {
			let group = groups[sid];
			if (group && group.length > 0) {
				sendMessage(sid);
			} else {
				// empty group
				process.nextTick(rpcCB(sid));
			}
		}
	}

}

/**
 * Channel maintains the receiver collection for a subject. You can
 * add users into a channel and then broadcast message to them by channel.
 *
 * @class channel
 * @constructor
 */
export class Channel {
	name: string
	groups: {[sid: string]: Uid[]}
	records: {[uid: string]: {sid: ServerId, uid: Uid}}
	__channelService__: ChannelService
	state: number
	userAmount: number

	constructor(name: string, service: ChannelService) {
		this.name = name;
		this.groups = {};       // group map for uids. key: sid, value: [uid]
		this.records = {};      // member records. key: uid
		this.__channelService__ = service;
		this.state = ST_INITED;
		this.userAmount = 0;
	}

	/**
	 * Add user to channel.
	 *
	 * @param {Number} uid user id
	 * @param {String} sid frontend server id which user has connected to
	 */
	add(uid: Uid, sid: ServerId) {
		if (this.state > ST_INITED) {
			return false;
		} else {
			var res = add(uid, sid, this.groups);
			if (res) {
				this.records[uid] = { sid, uid };
				++this.userAmount
			}
			addToStore(this.__channelService__, genKey(this.__channelService__, this.name), genValue(sid, uid));
			return res;
		}
	}

	/**
	 * Remove user from channel.
	 *
	 * @param {Number} uid user id
	 * @param {String} sid frontend server id which user has connected to.
	 * @return [Boolean] true if success or false if fail
	 */
	leave(uid: Uid, sid: ServerId) {
		if (!uid || !sid) {
			return false;
		}
		var res = deleteFrom(uid, sid, this.groups[sid]);
		if (res) {
			delete this.records[uid];
			this.userAmount = this.userAmount - 1;
		}
		if (this.userAmount < 0) this.userAmount = 0;//robust
		removeFromStore(this.__channelService__, genKey(this.__channelService__, this.name), genValue(sid, uid));
		if (this.groups[sid] && this.groups[sid].length === 0) {
			delete this.groups[sid];
		}
		return res;
	}

	/**
	 * Get channel UserAmount in a channel.
	 * @return channel member amount
	 */
	getUserAmount() {
		return this.userAmount;
	}

	/**
	 * Get channel members.
	 * <b>Notice:</b> Heavy operation.
	 * @return  channel member uid list
	 */
	getMembers(): Uid[] {
		var res: Uid[] = [], groups = this.groups;
		var group, i, l;
		for (var sid of Object.keys(groups)) {
			group = groups[sid];
			for (i = 0, l = group.length; i < l; i++) {
				res.push(group[i]);
			}
		}
		return res;
	}

	/**
	 * Get Member info.
	 *
	 * @param  uid user id
	 * @return member info
	 */
	getMember(uid: Uid): {sid: ServerId, uid: Uid} {
		return this.records[uid];
	}

	/**
	 * Destroy channel.
	 */
	destroy() {
		this.state = ST_DESTROYED;
		this.__channelService__.destroyChannel(this.name);
	}

	/**
	 * Push message to all the members in the channel
	 *
	 * @param  route message route
	 * @param  msg message that would be sent to client
	 * @param  opts user-defined push options, optional
	 * @param  cb callback function
	 */
	pushMessage(route: string, msg: IRespMessage, opts, cb: Callback<Uid[]>) {
		if (this.state !== ST_INITED) {
			utils.invokeCallback(cb, new Error('channel is not running now'));
			return;
		}

		if (typeof route !== 'string') {
			cb = opts;
			opts = msg;
			msg = route;
			route = msg.route;
		}

		if (!cb && typeof opts === 'function') {
			cb = opts;
			opts = {};
		}

		sendMessageByGroup(this.__channelService__, route, msg, this.groups, opts, cb);
	}

	pushMsgs(msgs: IRespMessageWrap[], opts, cb: Callback<Uid[]>) {
		if (this.state !== ST_INITED) {
			utils.invokeCallback(cb, new Error('channel is not running now'));
			return;
		}

		this.__channelService__.sendMsgsByGroup(msgs, this.groups, opts, cb);
	}

}

/**
 * add uid and sid into group. ignore any uid that uid not specified.
 *
 * @param uid user id
 * @param sid server id
 * @param groups {Object} grouped uids, , key: sid, value: [uid]
 */
var add = function (uid: Uid, sid: ServerId, groups: {[sid: string]: Uid[]}) {
	if (!sid) {
		logger.warn('ignore uid %j for sid not specified.', uid);
		return false;
	}

	var group = groups[sid];
	if (!group) {
		group = [];
		groups[sid] = group;
	}

	group.push(uid);
	return true;
};

/**
 * delete element from array
 */
var deleteFrom = function (uid: Uid, sid: ServerId, group: Uid[]) {
	if (!uid || !sid || !group) {
		return false;
	}

	for (var i = 0, l = group.length; i < l; i++) {
		if (group[i] === uid) {
			group.splice(i, 1);
			return true;
		}
	}

	return false;
};

/**
 * push message by group
 *
 * @param route {String} route route message
 * @param msg {Object} message that would be sent to client
 * @param groups {Object} grouped uids, , key: sid, value: [uid]
 * @param opts {Object} push options
 * @param cb {Function} cb(err)
 *
 * @api private
 */
var sendMessageByGroup = function (channelService: ChannelService, route: string, msg: IRespMessage, groups: {[sid: string]: Uid[]}, opts, cb: Callback<Uid[]>) {
	var app = channelService.app;
	var namespace = 'sys';
	var service = 'channelRemote';
	var method = 'pushMessage';
	var count = utils.size(groups);
	var successFlag = false;
	var failIds: Uid[] = [];

	logger.debug('[%s] channelService sendMessageByGroup route: %s, msg: %j, groups: %j, opts: %j', app.serverId, route, msg, groups, opts);
	if (count === 0) {
		// group is empty
		utils.invokeCallback(cb);
		return;
	}

	var latch = countDownLatch.createCountDownLatch(count, {}, function () {
		if (!successFlag) {
			utils.invokeCallback(cb, new Error('all uids push message fail'));
			return;
		}
		utils.invokeCallback(cb, null, failIds);
	});

	var rpcCB = function (serverId: ServerId) {
		return function (err: AnyErr, fails: Uid[]) {
			if (err) {
				logger.error('[pushMessage] fail to dispatch msg to serverId: ' + serverId + ', err:' + err.stack);
				latch.done();
				return;
			}
			if (fails) {
				failIds = failIds.concat(fails);
			}
			successFlag = true;
			latch.done();
		};
	};

	opts = { type: 'push', userOptions: opts || {} };
	// for compatiblity
	opts.isPush = true;

	var sendMessage = function (sid: ServerId) {
		return (function () {
			if (sid === app.serverId) {
				channelService.channelRemote.pushMessage(route, msg, groups[sid], opts, rpcCB(sid));
			} else {
				app.rpcInvoke(sid, {
					namespace, service, method, args: [route, msg, groups[sid], opts]
				}, rpcCB(sid));
			}
		})();
	};

	for (var sid in groups) {
		let group = groups[sid];
		if (group && group.length > 0) {
			sendMessage(sid);
		} else {
			// empty group
			process.nextTick(rpcCB(sid));
		}
	}
}

var restoreChannel = function (self: ChannelService, cb: Callback<void>) {
	if (!self.store) {
		utils.invokeCallback(cb);
		return;
	} else {
		loadAllFromStore(self, genKey(self), function (err, list) {
			if (!!err) {
				utils.invokeCallback(cb, err);
				return;
			} else {
				if (!list.length || !Array.isArray(list)) {
					utils.invokeCallback(cb);
					return;
				}
				var load = function (key: string) {
					return (function () {
						loadAllFromStore(self, key, function (err, items) {
							for (var j = 0; j < items.length; j++) {
								var array = items[j].split(':');
								var sid = array[0];
								var uid = array[1];
								var channel = self.channels[name];
								var res = add(uid, sid, channel.groups);
								if (res) {
									channel.records[uid] = { sid: sid, uid: uid };
								}
							}
						});
					})();
				};

				for (var i = 0; i < list.length; i++) {
					var name = list[i].slice(genKey(self).length + 1);
					self.channels[name] = new Channel(name, self);
					load(list[i]);
				}
				utils.invokeCallback(cb);
			}
		});
	}
};

var addToStore = function (self: ChannelService, key: string, value: string) {
	if (!!self.store) {
		self.store.add(key, value, function (err) {
			if (!!err) {
				logger.error('add key: %s value: %s to store, with err: %j', key, value, err.stack);
			}
		});
	}
};

var removeFromStore = function (self: ChannelService, key: string, value: string) {
	if (!!self.store) {
		self.store.remove(key, value, function (err) {
			if (!!err) {
				logger.error('remove key: %s value: %s from store, with err: %j', key, value, err.stack);
			}
		});
	}
};

var loadAllFromStore = function (self: ChannelService, key: string, cb: Callback<string[]>) {
	if (!!self.store) {
		self.store.load(key, function (err, list) {
			if (!!err) {
				logger.error('load key: %s from store, with err: %j', key, err.stack);
				utils.invokeCallback(cb, err);
			} else {
				utils.invokeCallback(cb, null, list);
			}
		});
	}
};

var removeAllFromStore = function (self: ChannelService, key: string) {
	if (!!self.store) {
		self.store.removeAll(key, function (err) {
			if (!!err) {
				logger.error('remove key: %s all members from store, with err: %j', key, err.stack);
			}
		});
	}
};

var genKey = function (self: ChannelService, name?: string) {
	if (!!name) {
		return self.prefix + ':' + self.app.serverId + ':' + name;
	} else {
		return self.prefix + ':' + self.app.serverId;
	}
};

var genValue = function (sid: ServerId, uid: Uid) {
	return sid + ':' + uid;
};
