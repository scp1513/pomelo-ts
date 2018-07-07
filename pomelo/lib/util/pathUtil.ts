import fs = require('fs');
import path = require('path');
import Constants = require('./constants');

/**
 * Get system remote service path
 * @param role server role: frontend, backend
 * @return path string if the path exist else null
 */
export function getSysRemotePath(role: string): string {
	var p = path.join(__dirname, '/../common/remote/', role);
	return fs.existsSync(p) ? p : null;
}

/**
 * Get user remote service path
 * @param  appBase    application base path
 * @param  serverType server type
 * @return path string if the path exist else null
 */
export function getUserRemotePath(appBase: string, serverType: ServerType): string {
	var p = path.join(appBase, '/app/servers/', serverType.toString(), Constants.DIR.REMOTE);
	return fs.existsSync(p) ? p : null;
}

/**
 * Get user remote cron path
 * @param  appBase    application base path
 * @param  serverType server type
 * @return path string if the path exist else null
 */
export function getCronPath(appBase: string, serverType: ServerType): string {
	var p = path.join(appBase, '/app/servers/', serverType.toString(), Constants.DIR.CRON);
	return fs.existsSync(p) ? p : null;
}

/**
 * List all the subdirectory names of user remote directory
 * which hold the codes for all the server types.
 * @param  appBase application base path
 * @return all the subdiretory name under servers/
 */
export function listUserRemoteDir(appBase: string): string[] {
	var base = path.join(appBase, '/app/servers/');
	var files = fs.readdirSync(base);
	return files.filter(function (fn) {
		if (fn.charAt(0) === '.') {
			return false;
		}

		return fs.statSync(path.join(base, fn)).isDirectory();
	});
}

/**
 * Compose remote path record
 * @param  namespace  remote path namespace, such as: 'sys', 'user'
 * @param  serverType
 * @param  path       remote service source path
 * @return remote path record
 */
export function remotePathRecord(namespace: string, serverType: ServerType, path: string) {
	return { namespace, serverType, path };
}

/**
 * Get handler path
 * @param  appBase    application base path
 * @param  serverType server type
 * @return path string if the path exist else null
 */
export function getHandlerPath(appBase: string, serverType: ServerType): string {
	var p = path.join(appBase, '/app/servers/', serverType.toString(), Constants.DIR.HANDLER);
	return fs.existsSync(p) ? p : null;
}

/**
 * Get admin script root path.
 * @param  appBase application base path
 * @return script path string
 */
export function getScriptPath(appBase: string): string {
	return path.join(appBase, Constants.DIR.SCRIPT);
}

/**
 * Get logs path.
 *
 * @param  appBase application base path
 * @return         logs path string
 */
export function getLogPath(appBase: string): string {
	return path.join(appBase, Constants.DIR.LOG);
}
