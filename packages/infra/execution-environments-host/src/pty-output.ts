import type { IPty } from 'node-pty'

/** Raw PTY bytes; only the private transport can apply backpressure. */
export function forwardPtyOutput(
  terminal: IPty,
  chunkBytes: number,
  send: (value: unknown) => boolean,
  identity?: () => string | undefined,
) {
  let paused = false
  process.stdout.on('drain', () => {
    paused = false
    terminal.resume()
  })
  return {
    paused: () => paused,
    output(data: Buffer) {
      const id = identity?.()
      for (let offset = 0; offset < data.length; offset += chunkBytes) {
        if (
          !send({
            kind: 'output',
            stream: 'terminal',
            ...(id === undefined ? {} : { id }),
            data: data.subarray(offset, offset + chunkBytes).toString('base64'),
          })
        )
          paused = true
      }
      if (paused) terminal.pause()
    },
  }
}
