/**
 * [encode an uInt32, return a array of bytes]
 * @param  num
 * @return
 */
export function encodeUInt32(num: any) {
	var n = parseInt(num);
	if (isNaN(n) || n < 0) {
		console.log(n);
		return null;
	}

	var result: number[] = [];
	do {
		var tmp = n % 128;
		var next = Math.floor(n / 128);

		if (next !== 0) {
			tmp = tmp + 128;
		}
		result.push(tmp);
		n = next;
	} while (n !== 0);

	return result;
}

/**
 * [encode a sInt32, return a byte array]
 * @param  num  The sInt32 need to encode
 * @return A byte array represent the integer
 */
export function encodeSInt32(num: any) {
	var n = parseInt(num);
	if (isNaN(n)) {
		return null;
	}
	n = n < 0 ? (Math.abs(n) * 2 - 1) : n * 2;

	return encodeUInt32(n);
}

export function decodeUInt32(bytes: any[]) {
	var n = 0;

	for (var i = 0; i < bytes.length; i++) {
		var m = parseInt(bytes[i]);
		n = n + ((m & 0x7f) * Math.pow(2, (7 * i)));
		if (m < 128) {
			return n;
		}
	}

	return n;
}

export function decodeSInt32(bytes: any[]) {
	var n = decodeUInt32(bytes);
	var flag = ((n % 2) === 1) ? -1 : 1;

	n = ((n % 2 + n) / 2) * flag;
	return n;
}
