
/**
 * "Memoizes" an async function.  A memoized function is executed exactly once
 * (except in cases where it errors before completing).  If it is executed a
 * second time, the value returned from the first execution is provided.
 *
 * @example
 *   class MyClass {
 *     constructor() {
 *       this.myFn = memo(this.myFn)
 *     }
 *
 *     public async myFn(i: number): Promise<string> {
 *       this.invocations++;
 *       return await longExpensiveCalculation(i)
 *     }
 *   }
 *
 *   const myClass = new MyClass()
 *   const i1 = await myClass.myFn()
 *   const i2 = await myClass.myFn()
 *   assert(myClass.invocations == 1) // true
 * @param fn The function to memoize.  Returns a wrapper function that enforces
 *   memoization.
 */
export function memo<Fn extends (...args: any[]) => Promise<any>>(fn: Fn): Fn {
  let memoized: any | undefined
  let gotIt: boolean = false
  let loading: Promise<any> | undefined
  return async function(...args: any[]) {
    if (gotIt) {
      return memoized
    }

    try {
      if (!loading) {
        loading = fn.call(this, ...args)
      }
      memoized = await loading
      gotIt = true
      loading = undefined
      return memoized
    } catch (ex) {
      loading = undefined
      throw ex
    }
  } as Fn
}
