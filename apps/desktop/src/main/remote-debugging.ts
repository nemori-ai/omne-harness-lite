import { writeSync } from 'node:fs'
import { app } from 'electron'
import {
  REMOTE_DEBUGGING_EXIT_CODE,
  REMOTE_DEBUGGING_REFUSED_MESSAGE,
  remoteDebuggingSwitch,
} from '../startup-signals.ts'
import { createLogger } from './log.ts'

/** Release only, first: a launch with a debugging switch ends before Chromium opens the endpoint. */
export function refuseRemoteDebugging(): void {
  const found = remoteDebuggingSwitch(
    name => app.commandLine.hasSwitch(name),
    process.argv,
    process.platform,
  )
  if (found === undefined) return
  const log = createLogger('info', line => {
    try {
      writeSync(1, line)
    } catch {}
  })
  log.error({ switch: found }, REMOTE_DEBUGGING_REFUSED_MESSAGE)
  exitNow(REMOTE_DEBUGGING_EXIT_CODE)
}

function exitNow(code: number): never {
  app.exit(code)
  // An Electron that defers `app.exit` this early must still not run the rest of the entry.
  const reallyExit: unknown = Reflect.get(process, 'reallyExit')
  if (typeof reallyExit === 'function') Reflect.apply(reallyExit, process, [code])
  process.kill(process.pid, 'SIGKILL')
  throw new Error('the process survived its own exit')
}
