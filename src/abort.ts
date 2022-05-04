/** A signal object that allows you to communicate with a DOM request (such as a Fetch) and abort it if required via an AbortController object. */
export interface AbortSignal {
  /**
   * Returns true if this AbortSignal's AbortController has signaled to abort, and false otherwise.
   */
  readonly aborted: boolean

  addEventListener: (
    type: 'abort',
    listener: (this: AbortSignal) => any,
    options?: { once?: boolean;}
  ) => void
}

export class AbortError extends Error {
  public readonly name = 'AbortError'
  constructor() {
    // Firefox: "The operation was aborted. "
    // Chrome: "The user aborted a request."
    // Safari: "Fetch is aborted"
    super('The user aborted a request.')
  }
}
