import { parseSessionHostStartup } from './session-host-startup.ts'
import { runSessionHostProcess } from './session-host-process.ts'

let requests = 0
let waiting: (() => void) | undefined
const stop = () => {
  if (waiting) {
    const notify = waiting
    waiting = undefined
    notify()
  } else requests++
}
const keepAlive = setInterval(() => {}, 60_000)
for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, stop)
try {
  if (process.argv.length !== 3) throw new TypeError('one Session host startup input required')
  const startup = parseSessionHostStartup(process.argv[2]!)
  await runSessionHostProcess(startup, {
    stopRequested: () =>
      requests
        ? (requests--, Promise.resolve())
        : new Promise<void>(resolve => {
            waiting = resolve
          }),
    diagnostic(error) {
      process.stderr.write(
        JSON.stringify({
          component: 'session-host',
          event: error instanceof Error ? 'failure' : 'observation',
          error: error instanceof Error ? error.name : 'UnknownFailure',
        }) + '\n',
      )
    },
  })
} catch (error) {
  process.exitCode = error instanceof TypeError ? 64 : 70
  process.stderr.write('omne-session-host: startup or shutdown failed\n')
} finally {
  clearInterval(keepAlive)
  for (const name of ['SIGINT', 'SIGTERM'] as const) process.off(name, stop)
}
