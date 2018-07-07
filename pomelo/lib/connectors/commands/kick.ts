import { Package } from '../../../../pomelo-protocol';

export function handle(socket: IPomeloSocket, reason: string) {
	// websocket close code 1000 would emit when client close the connection
	if (typeof reason === 'string') {
		let res = { reason }
		socket.sendRaw(Package.encode(Package.TYPE_KICK, new Buffer(JSON.stringify(res))));
	}
}
