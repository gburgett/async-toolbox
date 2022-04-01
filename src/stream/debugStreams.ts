export function debugStreams(
  streams: (NodeJS.ReadableStream | NodeJS.WritableStream)[],
  logger: Logger = console,
): NodeJS.Timeout {
  const states: any[] = []

  streams.forEach((stream) => {
    const name = streamName(stream)
    states.push({ flowing: false, ended: false })
    stream.on('error', (err: any) => {
      logger.error(`${name}: ${err}`)
    })

    const evts = ['close', 'end']
    evts.forEach((evt: string) => {
      stream.on(evt, (...args: []) => logger.debug(name, evt.toUpperCase(), ...args))
    })
  })

  return setInterval(() => {
    streams.forEach((stream: any, i) => {
      if (!stream._readableState) {
        return
      }

      const name = streamName(stream)
      const state = states[i]
      if (state.flowing != stream._readableState.flowing) {
        logger.debug(name, stream._readableState.flowing ? 'flowing' : 'NOT flowing')
      }
      if (state.ended != stream._readableState.ended) {
        logger.debug(name, stream._readableState.ended ? 'ended' : 'NOT ended')
      }
      if (state.pipes != stream._readableState.pipes) {
        logger.debug(name, stream._readableState.pipes ? 'piped to something' : 'UNPIPED!')
      }
      states[i] = {
        ...stream._readableState,
      }
    })

    const msg = [
      `name    \twritableLength\treadableLength`,
      ...streams.map((stream: any) => {
        return `${padStart(streamName(stream), 8)}\t${stream.writableLength}\t${stream.readableLength}`
      }),
    ]
    logger.error(clearLine)
    msg.forEach((line) => logger.error(clearLine + line))
    logger.error(goUp.repeat(msg.length + 2))
  }, 10)
}

function streamName(stream: any): string {
  return ('name' in stream) ? stream.name : stream.constructor.name
}

interface Logger {
  error: (...msg: any[]) => void
  debug: (...msg: any[]) => void
}

const clearLine = '\x1b[2K'
const goUp = '\x1b[F'

function padStart(str: string, amt: number) {
  if (str.length >= amt) {
    return str
  }
  return str + ' '.repeat(amt - str.length)
}
