import { EventEmitter } from 'events'
import { ConsoleService, IAuthSrvMsg } from '../consoleService'
import { MqttServer } from '../protocol/mqtt/mqttServer'
import MasterSocket = require('./masterSocket')
import protocol = require('../util/protocol')
import utils = require('../util/utils')

var logger = require('pomelo-logger').getLogger('pomelo-admin', 'MasterAgent')

var ST_INITED = 1;
var ST_STARTED = 2;
var ST_CLOSED = 3;

/**
 * MasterAgent Constructor
 *
 * @class MasterAgent
 * @constructor
 * @param {Object} opts construct parameter
 *                 opts.consoleService {Object} consoleService
 *                 opts.id             {String} server id
 *                 opts.type           {String} server type, 'master', 'connector', etc.
 *                 opts.socket         {Object} socket-io object
 *                 opts.reqId          {Number} reqId add by 1
 *                 opts.callbacks      {Object} callbacks
 *                 opts.state          {Number} MasterAgent state
 * @api public
 */
export class MasterAgent extends EventEmitter implements IMasterAgent {
	reqId: number
	idMap
	msgMap
	typeMap
	clients
	sockets
	slaveMap
	server: MqttServer
	callbacks
	state: number
	consoleService: ConsoleService

	constructor(consoleService: ConsoleService) {
		super()
		this.reqId = 1;
		this.idMap = {};
		this.msgMap = {};
		this.typeMap = {};
		this.clients = {};
		this.sockets = {};
		this.slaveMap = {};
		this.server = null;
		this.callbacks = {};
		this.state = ST_INITED;
		this.consoleService = consoleService;
	}

	/**
	 * master listen to a port and handle register and request
	 *
	 * @param {String} port
	 * @api public
	 */
	listen(port: number, cb: Callback<void>) {
		if (this.state > ST_INITED) {
			logger.error('master agent has started or closed.');
			return;
		}

		this.state = ST_STARTED;
		this.server = new MqttServer();
		this.server.listen(port);

		cb = cb || function () {}

		var self = this;
		this.server.on('error', function (err) {
			self.emit('error', err);
			cb(err);
		});

		this.server.once('listening', function () {
			setImmediate(function () {
				cb();
			});
		});

		this.server.on('connection', function (socket) {
			// var id, type, info, registered, username;
			var masterSocket = new MasterSocket(self, socket);

			self.sockets[socket.id] = socket;

			socket.on('register', function (msg: IAuthSrvMsg) {
				// register a new connection
				masterSocket.onRegister(msg);
			}); // end of on 'register'

			// message from monitor
			socket.on('monitor', function (msg) {
				masterSocket.onMonitor(msg);
			}); // end of on 'monitor'

			// message from client
			socket.on('client', function (msg) {
				masterSocket.onClient(msg);
			}); // end of on 'client'

			socket.on('reconnect', function (msg) {
				masterSocket.onReconnect(msg);
			});

			socket.on('disconnect', function () {
				masterSocket.onDisconnect();
			});

			socket.on('close', function () {
				masterSocket.onDisconnect();
			});

			socket.on('error', function (err) {
				masterSocket.onError(err);
			});
		});
	}

	/**
	 * close master agent
	 */
	close() {
		if (this.state > ST_STARTED) {
			return;
		}
		this.state = ST_CLOSED;
		this.server.close();
	}

	/**
	 * set module
	 * @param {String} moduleId module id/name
	 * @param {Object} value module object
	 */
	set(moduleId: string, value: any) {
		this.consoleService.set(moduleId, value);
	}

	/**
	 * get module
	 * @param {String} moduleId module id/name
	 */
	get(moduleId: string) {
		return this.consoleService.get(moduleId);
	}

	/**
	 * getClientById
	 * @param {String} clientId
	 */
	getClientById(clientId) {
		return this.clients[clientId];
	}

	/**
	 * request monitor{master node} data from monitor
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @param {Function} callback function
	 */
	request<T1, T2>(serverId: ServerId, moduleId: string, msg: T1, cb: Callback<T2>) {
		if (this.state > ST_STARTED) {
			return false;
		}

		cb = cb || function () { }

		var curId = this.reqId++;
		this.callbacks[curId] = cb;

		if (!this.msgMap[serverId]) {
			this.msgMap[serverId] = {};
		}

		this.msgMap[serverId][curId] = {
			moduleId: moduleId,
			msg: msg
		}

		var record = this.idMap[serverId];
		if (!record) {
			cb(new Error('unknown server id:' + serverId));
			return false;
		}

		this.sendToMonitor(record.socket, curId, moduleId, msg);

		return true;
	}

	/**
	 * request server data from monitor by serverInfo{host:port}
	 * @param {String} serverId
	 * @param {Object} serverInfo
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @param {Function} callback function
	 */
	requestServer(serverId, serverInfo, moduleId, msg, cb) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var record = this.idMap[serverId];
		if (!record) {
			utils.invokeCallback(cb, new Error('unknown server id:' + serverId));
			return false;
		}

		var curId = this.reqId++;
		this.callbacks[curId] = cb;

		if (utils.compareServer(record, serverInfo)) {
			this.sendToMonitor(record.socket, curId, moduleId, msg);
		} else {
			var slaves = this.slaveMap[serverId];
			for (var i = 0, l = slaves.length; i < l; i++) {
				if (utils.compareServer(slaves[i], serverInfo)) {
					this.sendToMonitor(slaves[i].socket, curId, moduleId, msg);
					break;
				}
			}
		}

		return true;
	}

	/**
	 * notify a monitor{master node} by id without callback
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 */
	notifyById(serverId, moduleId, msg) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var record = this.idMap[serverId];
		if (!record) {
			logger.error('fail to notifyById for unknown server id:' + serverId);
			return false;
		}

		this.sendToMonitor(record.socket, null, moduleId, msg);

		return true;
	}

	/**
	 * notify a monitor by server{host:port} without callback
	 * @param {String} serverId
	 * @param {Object} serverInfo{host:port}
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 */
	notifyByServer(serverId, serverInfo, moduleId, msg) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var record = this.idMap[serverId];
		if (!record) {
			logger.error('fail to notifyByServer for unknown server id:' + serverId);
			return false;
		}

		if (utils.compareServer(record, serverInfo)) {
			this.sendToMonitor(record.socket, null, moduleId, msg);
		} else {
			var slaves = this.slaveMap[serverId];
			for (var i = 0, l = slaves.length; i < l; i++) {
				if (utils.compareServer(slaves[i], serverInfo)) {
					this.sendToMonitor(slaves[i].socket, null, moduleId, msg);
					break;
				}
			}
		}
		return true;
	}

	/**
	 * notify slaves by id without callback
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 */
	notifySlavesById(serverId, moduleId, msg) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var slaves = this.slaveMap[serverId];
		if (!slaves || slaves.length === 0) {
			logger.error('fail to notifySlavesById for unknown server id:' + serverId);
			return false;
		}

		this.broadcastMonitors(slaves, moduleId, msg);
		return true;
	}

	/**
	 * notify monitors by type without callback
	 * @param {String} type serverType
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 */
	notifyByType(type, moduleId, msg) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var list = this.typeMap[type];
		if (!list || list.length === 0) {
			logger.error('fail to notifyByType for unknown server type:' + type);
			return false;
		}
		this.broadcastMonitors(list, moduleId, msg);
		return true;
	}

	/**
	 * notify all the monitors without callback
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 */
	notifyAll(moduleId, msg) {
		if (this.state > ST_STARTED) {
			return false;
		}
		this.broadcastMonitors(this.idMap, moduleId, msg);
		return true;
	}

	/**
	 * notify a client by id without callback
	 * @param  clientId
	 * @param  moduleId module id/name
	 * @param  msg
	 */
	notifyClient<T>(clientId: string, moduleId: string, msg: T) {
		if (this.state > ST_STARTED) {
			return false;
		}

		var record = this.clients[clientId];
		if (!record) {
			logger.error('fail to notifyClient for unknown client id:' + clientId);
			return false;
		}
		this.sendToClient(record.socket, null, moduleId, msg);
		return true;
	}

	notifyCommand<T>(command: string, moduleId: string, msg: T) {
		if (this.state > ST_STARTED) {
			return false;
		}
		this.broadcastCommand(this.idMap, command, moduleId, msg);
		return true;
	}

	/**
	 * add monitor,client to connection -- idMap
	 * @param {Object} agent agent object
	 * @param {String} id
	 * @param {String} type serverType
	 * @param {Object} socket socket-io object
	 */
	addConnection(id, type, pid, info, socket) {
		var record = {
			id: id,
			type: type,
			pid: pid,
			info: info,
			socket: socket
		};
		if (type === 'client') {
			this.clients[id] = record;
		} else {
			if (!this.idMap[id]) {
				this.idMap[id] = record;
				var list = this.typeMap[type] = this.typeMap[type] || [];
				list.push(record);
			} else {
				var slaves = this.slaveMap[id] = this.slaveMap[id] || [];
				slaves.push(record);
			}
		}
		return record;
	}

	/**
	 * remove monitor,client connection -- idMap
	 * @param {Object} agent agent object
	 * @param {String} id
	 * @param {String} type serverType
	 */
	removeConnection(agent, id, type, info) {
		if (type === 'client') {
			delete agent.clients[id];
		} else {
			// remove master node in idMap and typeMap
			var record = agent.idMap[id];
			if (!record) {
				return;
			}
			var _info = record['info']; // info {host, port}
			if (utils.compareServer(_info, info)) {
				delete agent.idMap[id];
				var list = agent.typeMap[type];
				if (list) {
					for (var i = 0, l = list.length; i < l; i++) {
						if (list[i].id === id) {
							list.splice(i, 1);
							break;
						}
					}
					if (list.length === 0) {
						delete agent.typeMap[type];
					}
				}
			} else {
				// remove slave node in slaveMap
				var slaves = agent.slaveMap[id];
				if (slaves) {
					for (var i = 0, l = slaves.length; i < l; i++) {
						if (utils.compareServer(slaves[i]['info'], info)) {
							slaves.splice(i, 1);
							break;
						}
					}
					if (slaves.length === 0) {
						delete agent.slaveMap[id];
					}
				}
			}
		}
	}

	/**
	 * send msg to monitor
	 * @param {Object} socket socket-io object
	 * @param {Number} reqId request id
	 * @param {String} moduleId module id/name
	 * @param {Object} msg message
	 */
	sendToMonitor(socket, reqId, moduleId, msg) {
		this.doSend(socket, 'monitor', protocol.composeRequest(reqId, moduleId, msg));
	}

	/**
	 * send msg to client
	 * @param {Object} socket socket-io object
	 * @param {Number} reqId request id
	 * @param {String} moduleId module id/name
	 * @param {Object} msg message
	 */
	private sendToClient(socket, reqId, moduleId, msg) {
		this.doSend(socket, 'client', protocol.composeRequest(reqId, moduleId, msg));
	}

	doSend(socket, topic, msg) {
		socket.send(topic, msg);
	}

	/**
	 * broadcast msg to monitor
	 * @param {Object} record registered modules
	 * @param {String} moduleId module id/name
	 * @param {Object} msg message
	 */
	private broadcastMonitors(records, moduleId, msg) {
		msg = protocol.composeRequest(null, moduleId, msg);

		if (records instanceof Array) {
			for (var i = 0, l = records.length; i < l; i++) {
				var socket = records[i].socket;
				this.doSend(socket, 'monitor', msg);
			}
		} else {
			for (var id in records) {
				var socket = records[id].socket;
				this.doSend(socket, 'monitor', msg);
			}
		}
	}

	private broadcastCommand(records, command, moduleId, msg) {
		msg = protocol.composeCommand(null, command, moduleId, msg);

		if (records instanceof Array) {
			for (var i = 0, l = records.length; i < l; i++) {
				var socket = records[i].socket;
				this.doSend(socket, 'monitor', msg);
			}
		} else {
			for (var id in records) {
				var socket = records[id].socket;
				this.doSend(socket, 'monitor', msg);
			}
		}
	}

	doAuthUser(msg: IAuthSrvMsg, socket, cb) {
		if (!msg.id) {
			// client should has a client id
			return cb(new Error('client should has a client id'));
		}

		var self = this;
		var username = msg.username;
		if (!username) {
			// client should auth with username
			this.doSend(socket, 'register', {
				code: protocol.PRO_FAIL,
				msg: 'client should auth with username'
			});
			return cb(new Error('client should auth with username'));
		}

		var authUser = self.consoleService.authUser;
		var env = self.consoleService.env;
		authUser(msg, env, (user) => {
			if (!user) {
				// client should auth with username
				this.doSend(socket, 'register', {
					code: protocol.PRO_FAIL,
					msg: 'client auth failed with username or password error'
				});
				return cb(new Error('client auth failed with username or password error'));
			}

			if (self.clients[msg.id]) {
				this.doSend(socket, 'register', {
					code: protocol.PRO_FAIL,
					msg: 'id has been registered. id:' + msg.id
				});
				return cb(new Error('id has been registered. id:' + msg.id));
			}

			logger.info('client user : ' + username + ' login to master');
			this.addConnection(msg.id, msg.type, null, user, socket);
			this.doSend(socket, 'register', {
				code: protocol.PRO_OK,
				msg: 'ok'
			});

			cb();
		});
	}

	doAuthServer(msg, socket, cb) {
		var self = this;
		var authServer = self.consoleService.authServer;
		var env = self.consoleService.env;
		authServer(msg, env, (status) => {
			if (status !== 'ok') {
				this.doSend(socket, 'register', {
					code: protocol.PRO_FAIL,
					msg: 'server auth failed'
				});
				cb(new Error('server auth failed'));
				return;
			}

			var record = this.addConnection(msg.id, msg.serverType, msg.pid, msg.info, socket);

			this.doSend(socket, 'register', {
				code: protocol.PRO_OK,
				msg: 'ok'
			});
			msg.info = msg.info || {}
			msg.info.pid = msg.pid;
			self.emit('register', msg.info);
			cb(null);
		});
	}

}
