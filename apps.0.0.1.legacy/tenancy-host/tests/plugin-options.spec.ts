import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { main, ENV } from '../src/index.ts'
import { deployment } from './support/deployment.ts'
import { portAccepting } from './support/wire.ts'
const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function io() {
  const output: string[] = [],
    errors: string[] = []
  return {
    output,
    errors,
    stdout: (line: string) => {
      output.push(line)
    },
    stderr: (line: string) => {
      errors.push(line)
    },
    shutdownSignal: vi.fn(() => {
      throw new Error('printing must not wait for shutdown')
    }),
    releaseShutdownSignal: vi.fn(),
  }
}
test.each([
  ['--unknown'],
  ['--plugins'],
  ['--plugins', '--print-plugins'],
  ['--plugins', 'a', '--plugins', 'b'],
  ['--print-plugins', '--print-plugins'],
] as const)(
  'rejects invalid serve options %j before signal or configuration',
  async (...options) => {
    const streams = io()
    expect(await main(['serve', ...options], streams)).toBe(64)
    expect(streams.errors.join('')).toContain('usage:')
    expect(streams.output).toEqual([])
    expect(streams.shutdownSignal).not.toHaveBeenCalled()
    expect(streams.releaseShutdownSignal).not.toHaveBeenCalled()
  },
)
test.each([false, true])(
  'prints safe operator sources with reversed flags=%s and no shutdown wait',
  async reverse => {
    const d = await deployment('print-options')
    roots.push(d.root)
    d.env[ENV.backupDirectory] = join(d.root, 'new-backups')
    d.env[ENV.opsSocketDirectory] = join(d.root, 'new-ops')
    for (const [key, value] of Object.entries(d.env)) vi.stubEnv(key, value)
    const file = join(d.root, 'plugins.json')
    await writeFile(
      file,
      JSON.stringify([
        {
          op: 'replace',
          id: 'clock-lease',
          config: { file: `${d.file}.clock.sqlite`, initialize: true },
        },
      ]),
    )
    const streams = io(),
      flags = reverse
        ? ['--print-plugins', '--plugins', file]
        : ['--plugins', file, '--print-plugins']
    expect(await main(['serve', ...flags], streams)).toBe(0)
    expect(streams.output).toHaveLength(1)
    expect(streams.output[0]).toMatch(/\n$/)
    const rows = JSON.parse(streams.output[0]!)
    expect(rows).toHaveLength(8)
    expect(rows.every((row: { config: unknown }) => row.config === '[redacted]')).toBe(true)
    expect(rows.find((row: { id: string }) => row.id === 'clock-lease')).toMatchObject({
      source: 'operator',
      editIndex: 0,
    })
    expect(streams.output[0]).not.toContain('-----BEGIN')
    const { existsSync } = await import('node:fs')
    expect(existsSync(d.file)).toBe(false)
    expect(existsSync(d.env[ENV.backupDirectory]!)).toBe(false)
    expect(existsSync(d.env[ENV.opsSocketDirectory]!)).toBe(false)
    expect(await portAccepting(d.port)).toBe(false)
    expect(streams.shutdownSignal).not.toHaveBeenCalled()
    expect(streams.releaseShutdownSignal).not.toHaveBeenCalled()
  },
)

test.each(['missing-file', 'bad-json', 'invalid-edit'] as const)(
  'real CLI rejects %s with one safe startup record',
  async mode => {
    const d = await deployment('print-file-failure')
    roots.push(d.root)
    const file = join(d.root, 'private-file-sentinel.json')
    if (mode !== 'missing-file')
      await writeFile(
        file,
        mode === 'bad-json'
          ? '{private-value-sentinel'
          : JSON.stringify([{ op: 'disable', id: 'nonexistent' }]),
      )
    const { spawnCli } = await import('./support/process.ts')
    const child = spawnCli(['serve', '--plugins', file, '--print-plugins'], d.env)
    try {
      expect(await child.exited()).toBe(1)
      const failures = child
        .stderr()
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
        .filter(line => line.event === 'startup-failed')
      expect(failures).toHaveLength(1)
      expect(failures[0]).toMatchObject({ stage: mode === 'invalid-edit' ? 'manifest' : 'config' })
      expect(child.stderr()).not.toContain('private-value-sentinel')
      expect(child.stderr()).not.toContain('private-file-sentinel')
      const { existsSync } = await import('node:fs')
      expect(existsSync(d.file)).toBe(false)
      expect(await portAccepting(d.port)).toBe(false)
    } finally {
      await child.kill()
    }
  },
)
