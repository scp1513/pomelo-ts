import { Application } from './application'
import Events = require('./util/events')

export function createApp(opts?: IApplicationOpts) {
	let app = new Application()
	app.init(opts)
	Object.defineProperty(module.exports, 'app', { get: () => app })
	return app
}

export const app: Application = undefined

export const version = '2.2.5'

export const events = Events

export const backendSession: IComponent = undefined
export const channel:        IComponent = undefined
export const connection:     IComponent = undefined
export const connector:      IComponent = undefined
export const dictionary:     IComponent = undefined
export const master:         IComponent = undefined
export const monitor:        IComponent = undefined
export const protobuf:       IComponent = undefined
export const proxy:          IComponent = undefined
export const pushScheduler:  IComponent = undefined
export const remote:         IComponent = undefined
export const server:         IComponent = undefined
export const session:        IComponent = undefined

export const components = {
	backendSession: <IComponent>undefined,
	channel:        <IComponent>undefined,
	connection:     <IComponent>undefined,
	connector:      <IComponent>undefined,
	dictionary:     <IComponent>undefined,
	master:         <IComponent>undefined,
	monitor:        <IComponent>undefined,
	protobuf:       <IComponent>undefined,
	proxy:          <IComponent>undefined,
	pushScheduler:  <IComponent>undefined,
	remote:         <IComponent>undefined,
	server:         <IComponent>undefined,
	session:        <IComponent>undefined,
}
Object.defineProperties(components, {
	backendSession: { get: () => load1('./components/backendSession', null, 'Component') },
	channel:        { get: () => load1('./components/channel',        null, 'Component') },
	connection:     { get: () => load1('./components/connection',     null, 'Component') },
	connector:      { get: () => load1('./components/connector',      null, 'Component') },
	dictionary:     { get: () => load1('./components/dictionary',     null, 'Component') },
	master:         { get: () => load1('./components/master',         null, 'Component') },
	monitor:        { get: () => load1('./components/monitor',        null, 'Component') },
	protobuf:       { get: () => load1('./components/protobuf',       null, 'Component') },
	proxy:          { get: () => load1('./components/proxy',          null, 'Component') },
	pushScheduler:  { get: () => load1('./components/pushScheduler',  null, 'Component') },
	remote:         { get: () => load1('./components/remote',         null, 'Component') },
	server:         { get: () => load1('./components/server',         null, 'Component') },
	session:        { get: () => load1('./components/session',        null, 'Component') },
})
Object.defineProperties(module.exports, {
	backendSession: { get: () => load1('./components/backendSession', null, 'Component') },
	channel:        { get: () => load1('./components/channel',        null, 'Component') },
	connection:     { get: () => load1('./components/connection',     null, 'Component') },
	connector:      { get: () => load1('./components/connector',      null, 'Component') },
	dictionary:     { get: () => load1('./components/dictionary',     null, 'Component') },
	master:         { get: () => load1('./components/master',         null, 'Component') },
	monitor:        { get: () => load1('./components/monitor',        null, 'Component') },
	protobuf:       { get: () => load1('./components/protobuf',       null, 'Component') },
	proxy:          { get: () => load1('./components/proxy',          null, 'Component') },
	pushScheduler:  { get: () => load1('./components/pushScheduler',  null, 'Component') },
	remote:         { get: () => load1('./components/remote',         null, 'Component') },
	server:         { get: () => load1('./components/server',         null, 'Component') },
	session:        { get: () => load1('./components/session',        null, 'Component') },
})


export const serial:  IFilter = undefined
export const time:    IFilter = undefined
export const timeout: IFilter = undefined
export const toobusy: IFilter = undefined

export const filters = {
	serial:  <IFilter>undefined,
	time:    <IFilter>undefined,
	timeout: <IFilter>undefined,
	toobusy: <IFilter>undefined,
}
Object.defineProperties(filters, {
	serial:  { get: () => load2('./filters/handler/serial',  null, 'Filter') },
	time:    { get: () => load2('./filters/handler/time',    null, 'Filter') },
	timeout: { get: () => load2('./filters/handler/timeout', null, 'Filter') },
	toobusy: { get: () => load2('./filters/handler/toobusy', null, 'Filter') },
})
Object.defineProperties(module.exports, {
	serial:  { get: () => load2('./filters/handler/serial',  null, 'Filter') },
	time:    { get: () => load2('./filters/handler/time',    null, 'Filter') },
	timeout: { get: () => load2('./filters/handler/timeout', null, 'Filter') },
	toobusy: { get: () => load2('./filters/handler/toobusy', null, 'Filter') },
})

export const rpcFilters = {
	rpcLog:  <IRpcFilter>undefined,
	toobusy: <IRpcFilter>undefined,
}
Object.defineProperties(rpcFilters, {
	rpcLog:  { get: () => load2('./filters/rpc/rpcLog',  null, 'Filter') },
	toobusy: { get: () => load2('./filters/rpc/toobusy', null, 'Filter') },
})

export const connectors = {
	hybridconnector: <IConnector>undefined,
	udpconnector:    <IConnector>undefined,
}
Object.defineProperties(connectors, {
	hybridconnector: { get: () => load1('./connectors/hybridconnector', null, 'Connector') },
	udpconnector:    { get: () => load1('./connectors/udpconnector',    null, 'Connector') },
})

export const pushSchedulers = {
	direct: <IScheduler>undefined,
	buffer: <IScheduler>undefined,
}
Object.defineProperties(pushSchedulers, {
	direct: { get: () => load1('./pushSchedulers/direct', null, 'Scheduler') },
	buffer: { get: () => load1('./pushSchedulers/buffer', null, 'Scheduler') },
})

function load1(path: string, name?: string, field?: string) {
	let f = !name ? require(path) : require(path + name)
	return !field ? f : f[field]
}

function load2(path: string, name?: string, field?: string) {
	let f = !name ? require(path) : require(path + name)
	return !field ? f : (opts: any) => new f[field](opts)
}
