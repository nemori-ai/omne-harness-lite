import { spawn } from 'node:child_process'
import { forwardArgv, type SpawnForward } from './events-gh.ts'

/** Suppress raw gh output, including usage, URLs and credentials. 422 is a stable sentinel. */
export const spawnLegacyForward: SpawnForward = args => {
  const child = spawn('gh', forwardArgv(args), {
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  })
  let conflict = false,
    tail = '',
    done = false
  child.stderr.on('data', (chunk: Buffer) => {
    tail = (tail + chunk.toString('utf8')).slice(-8192)
    conflict ||= /\b422\b/.test(tail)
  })
  const killChild = () => {
    child.kill()
  }
  process.once('exit', killChild)
  const exited = new Promise<number | null>(resolve => {
    const finish = (code: number | null) => {
      done = true
      process.removeListener('exit', killChild)
      resolve(conflict ? 422 : code)
    }
    child.once('error', () => finish(null))
    child.once('close', code => finish(code))
  })
  return {
    exited,
    stop: async () => {
      if (done) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      try {
        await exited
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
