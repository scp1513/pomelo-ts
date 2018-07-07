export function composeRequest(id, moduleId, body) {
	if (id) {
		// request message
		return JSON.stringify({
			reqId: id,
			moduleId: moduleId,
			body: body
		});
	} else {
		// notify message
		return {
			moduleId: moduleId,
			body: body
		};
	}
}

export function composeResponse(req, err, res) {
	if (req.reqId) {
		// request only
		return JSON.stringify({
			respId: req.reqId,
			error: cloneError(err),
			body: res
		});
	}
	// invalid message(notify dose not need response)
	return null;
}

export function composeCommand(id, command, moduleId, body) {
	if (id) {
		// command message
		return JSON.stringify({
			reqId: id,
			command: command,
			moduleId: moduleId,
			body: body
		});
	} else {
		return JSON.stringify({
			command: command,
			moduleId: moduleId,
			body: body
		});
	}
}

export function parse(msg) {
	if (typeof msg === 'string') {
		return JSON.parse(msg);
	}
	return msg;
}

export function isRequest(msg) {
	return (msg && msg.reqId);
}

function cloneError(origin) {
	// copy the stack infos for Error instance json result is empty
	if (!(origin instanceof Error)) {
		return origin;
	}
	var res = {
		message: origin.message,
		stack: origin.stack
	};
	return res;
}

export let PRO_OK = 1
export let PRO_FAIL = -1
