type AnyOpts = { [key: string]: any }
//type AnyMap = { [key: string]: any }
interface AnyMap { [key: string]: any }
type AnyErr = any
type Callback<T> = (err?: AnyErr, val?: T) => void

type Uid = number | string

type ServerId = number | string
type ServerType = number | string
type RouteFunc = (session, msg, app: IApplication, cb) => void
type RouteMap = { [serverType: string]: RouteFunc }
type ModuleId = string

type HandlerCb = (err?: AnyErr, resp?: IRespMessage, opts?: AnyMap) => void
type ErrorHandler = (err: AnyErr, msg: IMessage | IBackendMessage, resp: IRespMessage, session: IFrontendSession | IBackendSession, opts: AnyMap, cb: HandlerCb) => void
type IHandler = (msg: IBackendMessage, session: IFrontendSession | IBackendSession, cb: HandlerCb) => void

type BeforeStartupHandler = (app: IApplication, cb: () => void) => void
type AfterStartupHandler = (app: IApplication, cb: () => void) => void
type AfterStartupAllHandler = (app: IApplication) => void
type StopHandler = (app: IApplication, cb: () => void, cancelShutdown: () => void) => void
type LifecycleHandler = BeforeStartupHandler | AfterStartupHandler | AfterStartupAllHandler | StopHandler

interface IApplicationOpts {
    base?: string
}

interface IHandlerServiceOpts {
    reloadHandlers?: boolean
    enableForwardLog?: boolean
}

interface IPushSchedulerOpts {
    scheduler?: IScheduler | ISchedulerConstructor | { id: string | number, scheduler: IScheduler | ISchedulerConstructor, options?: AnyOpts }[]
    selector?: (reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: (id: string) => void) => void
}

interface IMonitorOpts {
    closeWatcher?: boolean
}

interface IServerInfo {
    serverType: ServerType
    id: ServerId
    host: string
    port: number

    clientPort?: number
    frontend?: boolean

    args?: string

    clusterCount?: number

    cpu?: number

    ['max-connections']?: number
    ['restart-force']?: boolean
    ['auto-restart']?: boolean
}

interface IMasterInfo {
    id: ServerId
    host: string
    port: number
}

interface IModuleInfo {
    moduleId: ModuleId
    module: IModuleConstructor
    opts?: AnyOpts
}

interface ICronInfo {
    id: number
    serverId?: ServerId
    time: string
    action: string
}

interface IComponent {
    start?(cb: Callback<void>): void
    afterStart?(cb: Callback<void>): void
    stop?(force: boolean, cb: Callback<void>): void
}

interface IComponentConstructor {
    new(app: IApplication, opts?: AnyOpts): IComponent
    _name: string
}

interface IFilter {
    before?(msg: IMessage | IBackendMessage, session: IFrontendSession | IBackendSession, next: HandlerCb): void
    after?(err: AnyErr, msg: IMessage | IBackendMessage, session: IFrontendSession | IBackendSession, resp: IRespMessage, next: Callback<void>): void
}

interface IRpcFilter {
    before?(serverId: ServerId, msg, opts, next): void
    after?(serverId: ServerId, msg, opts, next): void
}

interface IApplication {
}

//interface IConnector extends NodeJS.EventEmitter {
interface IConnector {
    addListener(event: string | symbol, listener: Function): this;
    on(event: string | symbol, listener: Function): this;
    once(event: string | symbol, listener: Function): this;
    removeListener(event: string | symbol, listener: Function): this;
    removeAllListeners(event?: string | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listeners(event: string | symbol): Function[];
    emit(event: string | symbol, ...args: any[]): boolean;
    listenerCount(type: string | symbol): number;
    prependListener(event: string | symbol, listener: Function): this;
    prependOnceListener(event: string | symbol, listener: Function): this;
    eventNames(): (string | symbol)[];

    start(cb: Callback<void>): void
    stop(force: boolean, cb: Callback<void>): void
    encode(reqId: number, route: string, msg: AnyMap): Buffer
    decode(msg: IPackage): IMessage

}

interface IConnectorOpts {
    //[key: string]: any
    useDict?: boolean
    useProtobuf?: boolean
    useCrypto?: boolean
    useHostFilter?: boolean
    useAsyncCoder?: boolean
    blacklistFun?: (cb: (err: AnyErr, list: string[]) => void) => void
}

interface ISession {
}

interface IFrontendSession {
    id: number
}

interface IBackendSession {
    frontendId: ServerId
    id: number
    uid: Uid
    settings: AnyMap
}

interface IBackendSessionOpts {
    id: number;
    frontendId: ServerId;
    uid: ServerId;
    settings: AnyMap;
}

interface IConsoleAgent extends NodeJS.EventEmitter {
    set<T>(moduleId: string, value: T): void
    get<T = any>(moduleId: string): any
}

interface IMonitorAgent extends IConsoleAgent {
    id: ServerId
    type: ServerType
    request<T1, T2>(moduleId: string, msg: T1, cb: Callback<T2>): void
    notify<T>(moduleId: string, msg: T): void
}

interface IMasterAgent extends IConsoleAgent {
    idMap: { [id: string]: { id: ServerId, type: ServerType, pid: number, info, socket } }
    notifyClient<T>(clientId: string, moduleId: string, msg: T): void
    notifyById<T>(serverId: ServerId, moduleId: string, msg: T): void
    notifyByType<T>(serverType: ServerType, moduleId: string, msg: T): void
    notifyAll<T>(moduleId: string, msg: T): void
    request<T1, T2>(serverId: ServerId, moduleId: string, msg: T1, cb: Callback<T2>): void
}

interface IConsoleService extends NodeJS.EventEmitter {
    agent: IMonitorAgent | IMasterAgent
}

interface IModule {
    type?: 'push' | 'pull'
    interval?: number
    delay?: number
    start?(cb: Callback<void>): void
    masterHandler?(agent: IMasterAgent, msg: any, cb: Callback<any>): void
    monitorHandler?(agent: IMonitorAgent, msg: any, cb: Callback<any>): void
    clientHandler?(agent: IMasterAgent, msg: any, cb: Callback<any>): void
}

interface IModuleConstructor {
    new(opts: AnyOpts, consoleService: IConsoleService): IModule
    moduleId: ModuleId
}

interface IScheduler {
    id?: string | number
    start?(cb?: Callback<void>): void
    stop?(force: boolean, cb?: Callback<void>): void
    schedule(reqId: number, route: string, msg: Buffer, recvs: number[], opts, cb: Callback<void>): void
}

interface ISchedulerConstructor {
    new(app: IApplication, opts?: AnyOpts): IScheduler
    id?: string | number
}

interface IEvent {

}

interface IEventConstructor {
    new(app: IApplication): IEvent
}

interface IPluginOpts {
    components: (IComponentConstructor | IComponent)[]
    events: (IEventConstructor | IEvent)[]
}

interface IRemoteAddress {
    ip: string
    port: number
}

interface IPackage {
    type: number
    body: Buffer
}

interface IMessage {
    id: number,
    type: number,
    compressRoute: number,
    route: string,
    body: AnyMap,
    compressGzip: number
}

interface IBackendMessageBase {
    __route__: string
}

interface IBackendMessage extends IBackendMessageBase {
    //[key: string]: any
}

interface IRespMessage {
    [key: string]: any
}

interface IMessageWrap<T> {
    route: string
    msg: T
}

type IRespMessageWrap = IMessageWrap<IRespMessage>

interface IRouteRec {
    route: string
    serverType: string
    handler: string
    method: string
}


//interface IPomeloSocket extends NodeJS.EventEmitter {
interface IPomeloSocket {
    addListener(event: string | symbol, listener: Function): this;
    on(event: string | symbol, listener: Function): this;
    once(event: string | symbol, listener: Function): this;
    removeListener(event: string | symbol, listener: Function): this;
    removeAllListeners(event?: string | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listeners(event: string | symbol): Function[];
    emit(event: string | symbol, ...args: any[]): boolean;
    listenerCount(type: string | symbol): number;
    prependListener(event: string | symbol, listener: Function): this;
    prependOnceListener(event: string | symbol, listener: Function): this;
    eventNames(): (string | symbol)[];

    id: number
    state: number
    remoteAddress: IRemoteAddress

    disconnect(): void
    send(msg: string | Buffer): void
    sendRaw(buffer: Buffer): void
    sendForce(buffer: Buffer): void
    sendBatch(msgs: Buffer[]): void
    handshakeResponse(buffer: Buffer): void
}

interface ISessionServiceOpts {
    /**一个uid是否只能绑定一个session */
    singleSession?: boolean
}

interface IDictionaryOpts {
    dict?: string
}

type ProtoType = 'uint32' | 'sint32' | 'int32' | 'double' | 'string' | 'message' | 'float' | 'bool'
type ProtoOption = 'required' | 'optional' | 'repeated'

interface IProto {
    [field: string]: number | IProto
}

interface IProtoField {
    option: ProtoOption
    type: ProtoType
    tag: number
}

interface IProtoParsed {
    __tags: { [idx: number]: /**fieldname*/string }
    __messages: { [name: string]: IProtoParsed }

    [field: string]: IProtoField
}

interface IChannelServiceStore {
    add(key: string, value: string, cb: Callback<void>): void
    load(key: string, cb: Callback<string[]>): void
    remove(key: string, value: string, cb: Callback<void>): void
    removeAll(key: string, cb: Callback<void>): void
}

interface IConsoleServiceOpts {
    master?: boolean
    port?: number
    authUser?: (msg: { username: string, password: string, md5?: boolean }, env: string, cb: (user?: { username: string, password: string }) => void) => void
    authServer?: (msg: { serverType: ServerType, token: string }, env: string, cb: (result: string) => void) => void
    closeWatcher?: boolean
    env?: string
    id?: ServerId
    type?: ServerType
    host?: string
    info?: IServerInfo
}

interface IHandshakeCli {
    sys: {
        type: string
        version: string

        dictVersion?: string

        rsa?: d

        protoVersion?: string
    }
}

interface IHandshakeSrv {
    heartbeat: number

    dict?: { [route: string]: number }
    routeToCode?: { [route: string]: number } // TODO: 重复了
    codeToRoute?: { [abbr: number]: string }
    dictVersion?: string
    useDict?: boolean

    protos?: {client: {[route: string]: IProtoParsed}, server: {[route: string]: IProtoParsed}, version: string}
    useProto?: boolean
}
