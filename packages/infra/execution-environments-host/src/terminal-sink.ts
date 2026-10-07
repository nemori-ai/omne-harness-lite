import { connect } from 'node:net'

/** One pipe reader per command stream. Backpressure propagates without merging streams. */
const path = process.argv[2]
if (path && process.argv[1] === new URL(import.meta.url).pathname) {
  const socket = connect(path)
  socket.on('connect', () => {
    process.stdin.on('data', (data: Buffer) => {
      if (!socket.write(data)) process.stdin.pause()
    })
    socket.on('drain', () => process.stdin.resume())
    process.stdin.on('end', () => socket.end())
    process.stdin.resume()
  })
  socket.on('error', () => {
    process.stdin.destroy()
    process.exitCode = 1
  })
}
