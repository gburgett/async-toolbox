
/**
 * Acts like setInterval, but waits for the async function to complete before
 * starting the interval.
 *
 * Ex:
 *   setRecurring(myFunc, 500):
 *   | -- execution takes 10ms -- | -- 500 ms -- | <-- total of 510 ms to next execution
 *   setInterval(myFunc, 500):
 *   | -- execution takes 10ms -- |
 *   | ------------------------- 500 ms ---- | <-- total of 500ms to next execution
 */
export function setRecurring<TArgs extends any[]>(
  fn: (...args: TArgs) => Promise<any>,
  ms: number,
  ...args: TArgs
): RecurrenceTimeout {
  const timeout = new RecurrenceTimeoutImpl(ms, fn, args)
  return timeout.start()
}

/** Clear a recurrence started by setRecurring */
export function clearRecurring(timeout: RecurrenceTimeout | undefined) {
  if (timeout) {
    timeout.clear()
  }
}

export interface RecurrenceTimeout {
  /** Clear the recurrence (stop it's next execution from happening) */
  clear(): void
}

class RecurrenceTimeoutImpl<TArgs extends any[] = any> implements RecurrenceTimeout {
  private cancelled = false
  private latestTimeout: NodeJS.Timeout | undefined

  constructor(
    private readonly interval: number,
    private readonly fn: (...args: TArgs) => Promise<any>,
    private readonly args: TArgs,
  ) {
  }

  /** Clear the recurrence (stop it's next execution from happening) */
  public clear() {
    this.cancelled = true
    if (this.latestTimeout) { clearTimeout(this.latestTimeout) }
  }

  /** Start the recurrence */
  public start(): this {
    if (this.latestTimeout) {
      throw new Error('Cannot start an already started recurrence')
    }

    const {fn, args, interval} = this
    const wrapped = async () => {
      try {
        await fn(...args)
      } finally {
        if (!this.cancelled) {
          this.latestTimeout = setTimeout(wrapped, interval)
        }
      }
    }

    this.latestTimeout = setTimeout(wrapped, interval)
    return this
  }
}
