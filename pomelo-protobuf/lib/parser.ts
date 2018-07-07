/**
 * [parse the original protos, give the paresed result can be used by protobuf encode/decode.]
 * @param  protos Original protos, in a js map.
 * @return The presed result, a js object represent all the meta data of the given protos.
 */
export function parse(protos: { [proto: string]: IProto }) {
	var maps: { [name: string]: IProtoParsed } = {};
	for (var key in protos) {
		maps[key] = parseObject(protos[key]);
	}

	return maps;
}

/**
 * [parse a single protos, return a object represent the result. The method can be invocked recursively.]
 * @param  obj The origin proto need to parse.
 * @return The parsed result, a js object.
 */
function parseObject(obj: IProto): IProtoParsed {
	var proto: IProtoParsed = {
		__messages: undefined,
		__tags: undefined,
	};
	var nestProtos: { [name: string]: IProtoParsed } = {};
	var tags: {[idx: number]: /**fieldname*/string} = {};

	for (var name in obj) {
		var tag = obj[name];
		var params = name.split(' ');

		switch (params[0]) {
			case 'message':
				if (params.length !== 2) {
					continue;
				}
				nestProtos[params[1]] = parseObject(<IProto>tag);
				break;
			case 'required':
			case 'optional':
			case 'repeated':
				{
					//params length should be 3 and tag can't be duplicated
					if (params.length !== 3) {
						console.error('proto format error', name);
						continue;
					}
					if (!!tags[<number>tag]) {
						console.error('proto tag duplicated', name);
						continue;
					}
					proto[params[2]] = {
						option: <ProtoOption>params[0],
						type: <ProtoType>params[1],
						tag: <number>tag
					};
					tags[<number>tag] = params[2];
				}
				break;
			default:
				// if (params.slice(0, 4) === 'map<') {
				// }
				console.error('invalid option for protobuf', params[0]);
				break;
		}
	}

	proto.__messages = nestProtos;
	proto.__tags = tags;
	return proto;
}
