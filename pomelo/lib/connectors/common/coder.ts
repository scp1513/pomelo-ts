import { EventEmitter } from "events"
import { Component as Dictionary } from '../../components/dictionary'
import { Component as Protobuf } from '../../components/protobuf'

import {Message}  from '../../../../pomelo-protocol';
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

export class Coder extends EventEmitter {
    useDict: boolean
	dictionary: Dictionary
	protobuf: Protobuf

	encode(reqId: number, route: string, msg: AnyMap): Buffer {
		if (!!reqId) {
			return this.composeResponse(reqId, route, msg);
		} else {
			return this.composePush(route, msg);
		}
	}

	decode(msg: IPackage): IMessage {
		let dmsg = Message.decode(msg.body)
		let result = <IMessage>dmsg
		let route = result.route

		// decode use dictionary
		if (!!dmsg.compressRoute) {
			if (!!this.useDict) {
				let abbrs = this.dictionary.getAbbrs();
				let routeId = <number>dmsg.route
				if (!abbrs[routeId]) {
					logger.error('dictionary error! no abbrs for route : %s', route);
					return null;
				}
				route = result.route = abbrs[routeId];
			} else {
				logger.error('fail to uncompress route code for msg: %j, server not enable dictionary.', dmsg);
				return null;
			}
		}

		// decode use protobuf
		if (!!this.protobuf && !!this.protobuf.getProtos().client[route]) {
			result.body = this.protobuf.decode(route, dmsg.body);
		} else {
			try {
				result.body = JSON.parse((dmsg.body).toString('utf8'));
			} catch (ex) {
				result.body = {};
			}
		}

		return result;
	}

	private composeResponse(msgId: number, route: string, msgBody: AnyMap) {
		if (!msgId || !route || !msgBody) {
			return null;
		}
		let buf = this.encodeBody(route, msgBody);
		return Message.encode(msgId, Message.TYPE_RESPONSE, 0, null, buf);
	}

	private composePush(route: string, msgBody: AnyMap): Buffer {
		if (!route || !msgBody) {
			return null;
		}
		let routeId: string|number = route;
		let bodyBuff = this.encodeBody(route, msgBody);
		// encode use dictionary
		let compressRoute = 0;
		if (!!this.dictionary) {
			var dict = this.dictionary.getDict();
			if (!!this.useDict && !!dict[route]) {
				routeId = dict[route];
				compressRoute = 1;
			}
		}
		return Message.encode(0, Message.TYPE_PUSH, compressRoute, routeId, bodyBuff);
	}

	private encodeBody(route: string, msgBody: AnyMap): Buffer {
		// encode use protobuf
		let buff: Buffer;
		if (!!this.protobuf && !!this.protobuf.getProtos().server[route]) {
			buff = this.protobuf.encode(route, msgBody);
		} else {
			buff = new Buffer(JSON.stringify(msgBody), 'utf8');
		}
		return buff;
	}

}