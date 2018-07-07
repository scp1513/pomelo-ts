export function isSimpleType(type: string) {
	return type === 'uint32' ||
		type === 'sint32' ||
		type === 'uInt32' ||
		type === 'sInt32' ||
		type === 'int32' ||
		type === 'uint64' ||
		type === 'sint64' ||
		type === 'uInt64' ||
		type === 'sInt64' ||
		type === 'float' ||
		type === 'double' ||
		type === 'bool'
}

export function equal(obj0: AnyMap, obj1: AnyMap) {
	for (let key in obj0) {
		let m = obj0[key]
		let n = obj1[key]

		if (typeof (m) === 'object') {
			if (!equal(m, n)) {
				return false
			}
		} else if (m !== n) {
			return false
		}
	}

	return true
}
