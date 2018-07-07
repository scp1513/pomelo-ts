import logger = require('pomelo-logger')
import { Application } from '../application'

/**
 * Configure pomelo logger
 */
export function configure(app: Application, filename: string) {
	var serverId = app.getServerId()
	var base = app.getBase()
	logger.configure(filename, { serverId, base })
}
