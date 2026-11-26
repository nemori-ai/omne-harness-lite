// @module-tag slow
import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function run(phase: 'a' | 'b', standing: string, root: string) {
  const args = [
    '--conditions=source',
    '--experimental-strip-types',
    '--import',
    './tests/fixtures/guidance-process-loader.mjs',
    'tests/fixtures/guidance-process.ts',
    phase,
    standing,
    root,
  ]
  console.log('OS_COMMAND', JSON.stringify({ executable: process.execPath, args }))
  return new Promise<{
    pid: number
    original?: unknown
    queried?: unknown[]
    beforeLate?: number
    afterLate?: number
    late?: { kind: string }
  }>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('OS_STARTED', phase, child.pid)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', code => {
      console.log('OS_EXIT', phase, child.pid, code, stdout, stderr)
      if (code !== 0) return reject(new Error(`child ${phase} exited ${code}: ${stderr}`))
      const line = stdout.split('\n').find(row => row.startsWith('GUIDANCE_PROCESS '))
      if (!line) return reject(new Error(`child ${phase} has no result: ${stdout}`))
      resolve(JSON.parse(line.slice('GUIDANCE_PROCESS '.length)))
    })
  })
}

it.each(['committed', 'not-submitted'] as const)(
  'C6 OS process B recovers %s guidance after A exits',
  async standing => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'guidance-os-')))
    try {
      const a = await run('a', standing, root)
      const b = await run('b', standing, root)
      expect(a.pid).not.toBe(b.pid)
      expect(b.queried).toContainEqual(a.original)
      expect(b.beforeLate).toBe(1)
      expect(b.afterLate).toBe(1)
      if (standing === 'not-submitted')
        expect(b.late).toMatchObject({
          kind: 'rolled_back',
          responses: expect.arrayContaining([
            expect.objectContaining({
              participant: 'session',
              reply: expect.objectContaining({
                kind: 'conflict',
                basis: { failure: { kind: 'changed', revision: expect.any(String) } },
              }),
            }),
          ]),
        })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  180000,
)
