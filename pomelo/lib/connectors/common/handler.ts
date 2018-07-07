import protocol = require('../../../../pomelo-protocol');
import Package = protocol.Package;
var logger = require('pomelo-logger').getLogger('pomelo', __filename);


var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
//var ST_CLOSED = 3;

function handleHandshake(socket: IPomeloSocket, pkg: IPackage) {
	if (socket.state !== ST_INITED) {
		return;
	}
	try {
		socket.emit('handshake', JSON.parse(protocol.strdecode(pkg.body)));
	} catch (ex) {
		socket.emit('handshake', {});
	}
}

function handleHandshakeAck(socket: IPomeloSocket, pkg: IPackage) {
	if (socket.state !== ST_WAIT_ACK) {
		return;
	}
	socket.state = ST_WORKING;
	socket.emit('heartbeat');
}

function handleHeartbeat(socket: IPomeloSocket, pkg: IPackage) {
	if (socket.state !== ST_WORKING) {
		return;
	}
	socket.emit('heartbeat');
}

function handleData(socket: IPomeloSocket, pkg: IPackage) {
	if (socket.state !== ST_WORKING) {
		return;
	}
	socket.emit('message', pkg);
}

let handlers = {
	[Package.TYPE_HANDSHAKE]: handleHandshake,
	[Package.TYPE_HANDSHAKE_ACK]: handleHandshakeAck,
	[Package.TYPE_HEARTBEAT]: handleHeartbeat,
	[Package.TYPE_DATA]: handleData,
}

export function handler(socket: IPomeloSocket, pkg: IPackage[]) {
	for (let v of pkg) {
		var handler = handlers[v.type];
		if (!!handler) {
			handler(socket, v);
		} else {
			logger.error('could not find handle invalid data package.');
			socket.disconnect();
		}
	}
}
