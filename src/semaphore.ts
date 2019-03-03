import { EventEmitter } from 'events'
import { Action, promisify } from './promisify'

export interface SemaphoreConfig {
  tokens: number
}

export interface Stats {
  inflight: number,
  queueSize: number,
  availableTokens: number
}

// tslint:disable-next-line:no-empty-interface
export interface ReadLock {
}

// tslint:disable-next-line:no-empty-interface
export interface WriteLock extends ReadLock {

}

type Task<T = any> = {
  tokens: number,
  action: (task: Task<T>) => Promise<T>,
} & (
  {
    state: 'uninitialized',
  } | {
    resolve: (value?: T | PromiseLike<T>) => void
    reject: (reason?: any) => void
    state: 'initialized' | 'queued' | 'running' | 'released',
  }
)

/**
 * A Semaphore which queues up tasks to be executed once prior tasks are complete.
 * Number of concurrent inflight tasks is configurable at initialization.
 */
export class Semaphore extends EventEmitter {
  public config: Readonly<SemaphoreConfig>

  private inflight = [] as Task[]
  private inflightTokens: number = 0
  private queue: Array<Task<any>> = []

  constructor(config?: SemaphoreConfig) {
    super()

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
      inflight: this.inflight.length,
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
  public lock<T>(action: Action<T>, rw: 'read' | 'write' = 'read'): Promise<T> {
    const task: Task<T> = {
      action: () => promisify(action),
      tokens: rw && rw == 'write' ? this.config.tokens : 1,
      state: 'uninitialized',
    }

    const enqueue = (toEnqueue: Task<T>) => {
      if (toEnqueue.state != 'initialized') {
        throw new Error(`Cannot run an uninitialized task! ${toEnqueue}`)
      }

      if (this.queue.length == 0 &&
          (this.inflightTokens + toEnqueue.tokens) <= this.config.tokens) {
        this.inflightTokens += toEnqueue.tokens
        this.inflight.push(toEnqueue)
        // yield the execution queue before running the next request
        setTimeout(() => this._runTask(toEnqueue), 0)
      } else {
        toEnqueue.state = 'queued'
        this.queue.push(toEnqueue)
      }
    }

    const promise = new Promise<T>((resolve, reject) => {
      Object.assign(task,
        {
          state: 'initialized',
          resolve: (result: any) => {
            this._release(task)
            resolve(result)
          },
          reject: (err: any) => {
            this._release(task)
            reject(err)
          },
        })
      enqueue(task)
    })

    return promise
  }

  private _release(task: Task<any>) {
    const taskIndex = this.inflight.indexOf(task)
    if (taskIndex == -1 || task.state != 'running') {
      throw new Error(`Cannot release a task that isn't running: ${task}`)
    }

    delete(task.resolve)
    delete(task.reject)
    task.state = 'released'
    this.inflight.splice(taskIndex, 1)
    this.inflightTokens -= task.tokens

    const nextTask = this.queue[0]
    if (nextTask) {
      if (this.inflight.length == 0 || (this.inflightTokens + nextTask.tokens) <= this.config.tokens) {
        this.queue.shift()
        this.inflightTokens += nextTask.tokens
        this.inflight.push(nextTask)
        // yield the execution queue before running the next request
        setTimeout(() => this._runTask(nextTask), 0)
      }
    } else {
      if (this.isEmpty()) {
        this.emit('empty')
      }
    }

    const calculatedInflight = this.inflight.reduce((memo, t) =>  memo + t.tokens, 0)
    if (this.inflightTokens != calculatedInflight) {
      throw new Error(`Invalid state: number of current tokens does not match inflight tasks. ` +
        `${this.inflightTokens} ${calculatedInflight}`)
    }
  }

  private async _runTask<T>(task: Task<T>) {
    if (task.state == 'uninitialized') {
      throw new Error(`Cannot run an uninitialized task: ${task}`)
    }

    try {
      task.state = 'running'
      task.resolve(await task.action(task))
    } catch (e) {
      if (task.reject) {
        task.reject(e)
      } else {
        throw e
      }
    }
  }
}

// tslint:disable:max-classes-per-file
class ReadLockImpl implements ReadLock {

}

class WriteLockImpl extends ReadLockImpl implements WriteLock {

}
