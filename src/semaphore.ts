import { promisify, TaskCB } from './promisify'

export interface SemaphoreConfig {
  // The maximum number of simultaneous invocations of a task
  tokens: number
}

export interface Stats {
  inflight: number,
  queueSize: number,
  availableTokens: number
}

// tslint:disable-next-line:no-empty-interface
export interface ReadLock {
  type: 'read'

  upgrade(): Promise<WriteLock>
}

// tslint:disable-next-line:no-empty-interface
export interface WriteLock {
  type: 'write'

  downgrade(): Promise<ReadLock>
}

export type Action<T, L extends ReadLock | WriteLock = ReadLock | WriteLock> =
  ((lock: L) => Promise<T>) | ((lock: L, cb: TaskCB<T>) => void)

type Task<T = any> = {
  tokens: number,
  meta?: { [K: string]: any },
} & (
  {
    state: 'uninitialized',
  } | {
    action: (task: Task<T>) => Promise<T>,
    resolve: (value?: T | PromiseLike<T>) => void
    reject: (reason?: any) => void
    state: 'initialized' | 'running' | 'released',
  }
)

/**
 * A Semaphore which queues up tasks to be executed once prior tasks are complete.
 * Number of concurrent inflight tasks is configurable at initialization.
 */
export class Semaphore {
  public config: Readonly<SemaphoreConfig>

  private inflight = [] as Task[]
  private inflightTokens: number = 0
  private queue: Task<any>[] = []

  private listenerMap: Map<string, Set<(...args: any[]) => void>> = new Map()

  constructor(config?: SemaphoreConfig) {
    this.config = Object.assign({
      tokens: 1,
    }, config)
    if (!this.config.tokens || this.config.tokens <= 0) {
      throw new Error('Tokens must be > 0')
    }
  }

  /**
   * Gets a snapshot of the current state of the semaphore.
   * @returns the current number of inflight requests, and the current queue size.
   */
  public stats(): Readonly<Stats> {
    return {
      inflight: count(this.inflight, (task) => task.meta && task.meta.virtual ? 0 : 1),
      queueSize: this.queue.length,
      availableTokens: this.config.tokens - this.inflightTokens,
    }
  }

  /**
   * Checks if the semaphore is currently empty.  You can poll this or wait for
   * the 'empty' event to be raised.
   */
  public isEmpty(): boolean {
    return this.inflight.length == 0 && this.queue.length == 0
  }

  /**
   * Wraps the given function inside a synchronization wrapper, which locks the
   * semaphore around every invocation of the function.
   * @param fn
   */
  public synchronize<Fn extends (...args: any[]) => Promise<any>>(fn: Fn): Fn {
    const semaphore = this
    return function(this: any, ...args: any[]) {
      const self = this
      return semaphore.lock(() =>
        fn.apply(self, args),
      )
    } as Fn
  }

  /**
   * Locks the semaphore, running or enqueuing the given task.  The semaphore is
   * not unlocked until the task completes.  The task should perform the minimum
   * required work and then return a value.  For example, connecting to a remote
   * API and returning the response body for further processing.
   *
   * The task can either be an async function returning a promise, or a function
   * that accepts a callback as the first parameter.
   *
   * @param action An action to be run when the number of inflight tasks is below the limit.
   * @returns A promise that completes when the action completes, returning the result
   *  of the action.
   */
  public lock<T>(action: Action<T, ReadLock>, rw?: 'read'): Promise<T>
  public lock<T>(action: Action<T, WriteLock>, rw: 'write'): Promise<T>
  public lock<T>(action: Action<T>, rw?: 'read' | 'write'): Promise<T>

  public lock<T>(action: Action<T>, rw: 'read' | 'write' = 'read'): Promise<T> {
    rw = rw && rw == 'write' ? 'write' : 'read'
    const task: Task<T> = {
      tokens: rw == 'write' ? this.config.tokens : 1,
      meta: { from: '_lock' },
      state: 'uninitialized',
    }

    const promise = new Promise<T>((resolve, reject) => {
      Object.assign(task,
        {
          state: 'initialized',
          action: () => promisify(
            (cb) => {
              const lock = rw == 'write' ?
                new Semaphore.WriteLockImpl(task, this) :
                new Semaphore.ReadLockImpl(task, this)
              return action(lock, cb)
            }),
          resolve: (result: any) => {
            this._release(task)
            resolve(result)
          },
          reject: (err: any) => {
            this._release(task)
            reject(err)
          },
        })
      this._onInitialized(task)
    })

    this._enqueue(task)

    return promise
  }

  private _enqueue(task: Task, priority?: boolean) {
    if (task.state != 'initialized' && task.state != 'uninitialized') {
      throw new Error(`Cannot enqueue a previously enqueued task! ${task}`)
    }
    if (task.tokens <= 0) {
      throw new Error(`Cannot enqueue a task with no tokens! ${task}`)
    }

    if (task.state == 'initialized' &&
        this.queue.length == 0 &&
        (this.inflightTokens + task.tokens) <= this.config.tokens) {
      this.inflightTokens += task.tokens
      this.inflight.push(task)
      // yield the execution queue before running the next request
      setTimeout(() => this._runTask(task), 0)
    } else {
      if (priority) {
        this.queue.unshift(task)
      } else {
        this.queue.push(task)
      }
    }
  }

  private _onInitialized(task: Task) {
    if (this.inflight.length == 0 && this.queue.length > 0) {
      // we need to pump the queue now that the task has been initialized
      this._releaseTokens(0)
    }
  }

  private _release(task: Task) {
    const taskIndex = this.inflight.indexOf(task)
    if (taskIndex == -1 || task.state != 'running') {
      throw new Error(`Cannot release a task that isn't running: ${task}`)
    }

    this._releaseTokens(task.tokens)
    task.state = 'released'
    this.inflight.splice(taskIndex, 1)
    if (this.isEmpty()) {
      this._emit('empty')
    }
  }

  private _releaseTokens(tokens: number) {
    this.inflightTokens -= tokens

    const nextTask = this.queue[0]
    if (nextTask) {
      if (nextTask.state == 'uninitialized') {
        // put it back on the queue till it gets initialized
        this._enqueue(nextTask)
      } else if (this.inflight.length == 0 || (this.inflightTokens + nextTask.tokens) <= this.config.tokens) {
        this.queue.shift()
        this.inflightTokens += nextTask.tokens
        this.inflight.push(nextTask)
        // yield the execution queue before running the next request
        setTimeout(() => this._runTask(nextTask), 0)
      }
    }
  }

  private _acquireTokens(tokens: number, priority?: boolean): Promise<number> {
    const task: Task<number> = {
      state: 'uninitialized',
      meta: { from: '_acquireTokens', virtual: true },
      tokens,
    }
    this._enqueue(task, priority)

    return new Promise((resolve, reject) => {
      Object.assign(task, {
        state: 'initialized',
        action: () => {
          return Promise.resolve(tokens)
        },
        resolve: () => {
          // the tokens are transferred to the promise consumer
          task.tokens = 0
          this._release(task)
          resolve(tokens)
        },
        reject: (err: any) => {
          this._release(task)
          reject(err)
        },
      })
      this._onInitialized(task)
    })
  }

  private async _runTask<T>(task: Task<T>) {
    if (task.state == 'uninitialized') {
      throw new Error(`Cannot run an uninitialized task: ${task}`)
    }

    try {
      task.state = 'running'
      task.resolve(await task.action(task))
    } catch (e) {
      if (task.reject && task.state == 'running') {
        task.reject(e)
      } else {
        throw e
      }
    }
  }

  // implement part of the EventEmitter interface
  public on(event: 'empty', listener: () => void): this
  public on(event: string, listener: (...args: any[]) => void): this {
    let set = this.listenerMap.get(event)
    if (!set) {
      set = new Set()
      this.listenerMap.set(event, set)
    }
    set.add(listener)
    return this
  }
  public addListener = this.on

  public once(event: 'empty', listener: () => void): this
  public once(event: string, listener: (...args: any[]) => void): this {
    return this.on(event as any, (...args) => {
      try {
        listener(...args)
      } finally {
        this.off(event as any, listener)
      }
    })
  }

  public off(event: 'empty', listener: () => void): this
  public off(event: string, listener: (...args: any[]) => void): this {
    const set = this.listenerMap.get(event)
    if (set) {
      set.delete(listener)
    }
    return this
  }
  public removeListener = this.off

  private _emit(event: string, ...args: any[]) {
    const set = this.listenerMap.get(event)
    if (set) {
      set.forEach((listener) => {
        try {
          listener.apply(this, args)
        } catch (e) {
          // ignore errors in listeners
        }
      })
    }
  }

  // tslint:disable:member-ordering
  // tslint:disable:max-classes-per-file
  // tslint:disable:variable-name
  private static readonly ReadLockImpl = class implements ReadLock {
    public type: 'read'

    private consumed: boolean | undefined

    constructor(private readonly task: Task, private readonly semaphore: Semaphore) {
      this.type = 'read'
    }

    public async upgrade(): Promise<WriteLock> {
      if (this.consumed) {
        throw new Error('Cannot upgrade again - please use the lock returned by previous upgrade() call')
      }
      const taskIndex = this.semaphore.inflight.indexOf(this.task)
      if (this.task.state != 'running' || taskIndex == -1) {
        throw new Error(`Cannot upgrade a non-running task!  Did you forget to await something?` +
          `  Task state was ${this.task.state}`)
      }
      this.consumed = true

      // becomes a write lock by setting the number of tokens
      const maxTokens = this.semaphore.config.tokens
      const p = this.semaphore._acquireTokens(maxTokens, true)

      // acquiring max tokens doesn't happen till we release our task's tokens
      this.semaphore._releaseTokens(this.task.tokens)
      this.task.tokens = 0

      this.task.tokens = await p

      return new Semaphore.WriteLockImpl(this.task, this.semaphore)
    }
  }

  private static readonly WriteLockImpl = class implements WriteLock {
    public type: 'write'

    private consumed: boolean | undefined

    constructor(private readonly task: Task, private readonly semaphore: Semaphore) {
      this.type = 'write'
    }

    public async downgrade(): Promise<ReadLock> {
      if (this.consumed) {
        throw new Error('Cannot downgrade again - please use the lock returned by previous downgrade() call')
      }

      const tokensToRelease = this.task.tokens - 1
      if (tokensToRelease <= 0) {
        throw new Error(`Cannot downgrade a lock that has fewer than two tokens (had ${this.task.tokens})`)
      }
      this.consumed = true

      this.semaphore._releaseTokens(tokensToRelease)
      this.task.tokens -= tokensToRelease

      return new Semaphore.ReadLockImpl(this.task, this.semaphore)
    }
  }
}

function count<T>(arr: T[], fn: (item: T) => number): number {
  let c = 0
  for (const item of arr) {
    c += fn(item)
  }
  return c
}
