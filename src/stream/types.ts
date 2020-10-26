import { Readable as ReadableImpl, Transform as TransformImpl, Writable as WritableImpl } from 'stream'

export interface Readable<T> extends ReadableImpl {
  read(size?: number): T
  readAsync(size?: number): Promise<T>
  push(chunk: T, encoding?: string): boolean
}

export interface Writable<T> extends WritableImpl {
  write(chunk: T, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: T, encoding?: string, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: any, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: any, encoding?: string, cb?: (error: Error | null | undefined) => void): boolean
  writeAsync(chunk: T, encoding?: string): Promise<void>
  end(cb?: () => void): void
  end(chunk: T, cb?: () => void): void
  end(chunk: T, encoding?: string, cb?: () => void): void
  end(chunk: any, cb?: () => void): void
  end(chunk: any, encoding?: string, cb?: () => void): void
}

export interface Transform<T, U> extends TransformImpl {
  read(size?: number): U
  readAsync(size?: number): Promise<U>
  push(chunk: U, encoding?: string): boolean

  write(chunk: T, cb?: (error: Error | null | undefined) => void): boolean
  write(chunk: T, encoding?: string, cb?: (error: Error | null | undefined) => void): boolean
  writeAsync(chunk: T, encoding?: string): Promise<void>
  end(cb?: () => void): void
  end(buffer: Buffer, cb?: () => void): void
  end(chunk: T, cb?: () => void): void
  end(chunk: T, encoding?: string, cb?: () => void): void
}
