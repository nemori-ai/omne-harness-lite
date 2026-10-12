import { spawn } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { bodyA, createFixture, refA } from './support.ts'

it('real SIGKILL before commit rolls back; committed receipt loss retains the complete replica (MCR-V4 scoped)', async () => {
  const f = await createFixture()
  const evidence = fileURLToPath(new URL('../tmp/resource-records.jsonl', import.meta.url))
  await mkdir(join(evidence, '..'), { recursive: true })
  try {
    await f.bind(refA)
    for (const phase of ['upserted', 'committed']) {
      const argv = [
        '--experimental-strip-types',
        fileURLToPath(new URL('./crash-worker.ts', import.meta.url)),
        f.file,
        f.keyFile,
        phase,
      ]
      const child = spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
      const reached = Promise.withResolvers<void>()
      let text = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        text += chunk
        if (text.includes(`${phase}\n`)) reached.resolve()
      })
      child.stderr.resume()
      child.on('error', error => {
        reached.reject(error)
        exited.reject(error)
      })
      child.on('exit', (code, signal) => {
        exited.resolve({ code, signal })
        if (!text.includes(`${phase}\n`))
          reached.reject(new Error('child ended before requested phase'))
      })
      try {
        await reached.promise
        expect(child.kill('SIGKILL')).toBe(true)
        const exit = await exited.promise
        expect(exit).toEqual({ code: null, signal: 'SIGKILL' })
        await appendFile(
          evidence,
          JSON.stringify({
            pid: child.pid,
            argv,
            phase,
            reached: true,
            actualExit: exit,
            resourceOwner: 'terminated-child',
            file: f.file,
            keyFile: f.keyFile,
          }) + '\n',
        )
      } finally {
        child.stdin.destroy()
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
          await exited.promise
        }
      }
      expect(await f.read()).toEqual(phase === 'upserted' ? { absent: true } : { body: bodyA })
    }
  } finally {
    await f.cleanup()
  }
})
