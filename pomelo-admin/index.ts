export { ConsoleService, createMasterConsole, createMonitorConsole } from './lib/consoleService'

export let modules = {
	monitorLog:  <IModuleConstructor>undefined,
	nodeInfo:    <IModuleConstructor>undefined,
	profiler:    <IModuleConstructor>undefined,
	scripts:     <IModuleConstructor>undefined,
	systemInfo:  <IModuleConstructor>undefined,
	watchServer: <IModuleConstructor>undefined,
}

Object.defineProperties(modules, {
	monitorLog:  { get: () => load.bind(null, './lib/modules/monitorLog',  null, 'Module') },
	nodeInfo:    { get: () => load.bind(null, './lib/modules/nodeInfo',    null, 'Module') },
	profiler:    { get: () => load.bind(null, './lib/modules/profiler',    null, 'Module') },
	scripts:     { get: () => load.bind(null, './lib/modules/scripts',     null, 'Module') },
	systemInfo:  { get: () => load.bind(null, './lib/modules/systemInfo',  null, 'Module') },
	watchServer: { get: () => load.bind(null, './lib/modules/watchServer', null, 'Module') },
})

function load(path: string, name?: string, field?: string) {
	let f = !name ? require(path) : require(path + name)
	return !field ? f : f[field]
}
