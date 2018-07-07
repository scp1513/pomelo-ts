declare module 'seq-queue' {
    export const STATUS_IDLE = 0
    export const STATUS_BUSY = 1
    export const STATUS_CLOSED = 2
    export const STATUS_DRAINED = 3

    export function createQueue(timeout?: number): SeqQueue

    export class SeqQueue extends NodeJS.EventEmitter {
        push(fn: (task: Task) => void, ontimeout?: ()=>void, timeout?: number): boolean
        close(force: boolean): void
    }

    export interface Task {
        done(): boolean
    }
}
