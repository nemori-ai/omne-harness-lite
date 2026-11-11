// @module-tag slow
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const home = realpathSync(mkdtempSync(join(tmpdir(), 'gate-cli-options-'))),
  missing = join(home, 'absent.json'),
  calls = join(home, 'unexpected-gh'),
  bin = join(home, 'bin')
mkdirSync(bin)
writeGh(bin, `#!/bin/sh\ntouch '${calls}'\nexit 97\n`)
afterAll(() => rmSync(home, { recursive: true, force: true }))

const args = ['wait', '--run', '1', '--note', missing, '--config', missing],
  option = '--config'

function run(args: string[]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../src/integration/gate-cli.ts', import.meta.url)), ...args],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...ghEnv(bin),
        OMNE_DELIVERY_FACTS: 'direct',
      },
      timeout: 10_000,
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(2)
  expect(result.stdout).toBe('')
  expect(existsSync(calls)).toBe(false)
  const error: unknown = JSON.parse(result.stderr)
  expect(error).toMatchObject({
    kind: expect.stringContaining('-error'),
    message: expect.any(String),
  })
  if (
    typeof error !== 'object' ||
    error === null ||
    !('message' in error) ||
    typeof error.message !== 'string'
  )
    throw new Error('Missing CLI error message')
  return error.message
}

describe('gate public option boundary', () => {
  it('preserves valid syntax through the input-file boundary, with or without --', () => {
    expect(run(args)).not.toContain('Usage:')
    expect(run([...args, '--'])).not.toContain('Usage:')
  })
  it('rejects duplicate values before reading files or calling GitHub', () => {
    expect(run([...args, option, 'other.json'])).toContain('Usage:')
  })
  it('rejects unknown options and missing values', () => {
    expect(run([...args, '--unknown'])).toContain('Usage:')
    expect(run([...args, option])).toContain('Usage:')
  })
  it('does not resume option parsing after --', () => {
    expect(run([...args, '--', '--unknown'])).toContain('Usage:')
  })
  it('has no presence flags', () => {
    expect(run([...args, '--apply'])).toContain('Usage:')
  })
})

describe('gate configuration file', () => {
  it('reads the repository from the file that --config names', () => {
    const recorded = join(home, 'recorded-gh'),
      note = join(home, 'note.txt'),
      config = join(home, 'delivery.json'),
      recorder = join(home, 'recorder-bin')
    mkdirSync(recorder)
    writeGh(recorder, `#!/bin/sh\necho "$@" >> '${recorded}'\nexit 97\n`)
    writeFileSync(note, 'confirmed')
    writeFileSync(
      config,
      JSON.stringify({
        schemaVersion: 3,
        kind: 'github-delivery-config',
        repository: 'named-owner/named-repo',
      }),
    )
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../src/integration/gate-cli.ts', import.meta.url)),
        'wait',
        '--run',
        '7',
        '--note',
        note,
        '--config',
        config,
      ],
      { encoding: 'utf8', env: { ...process.env, ...ghEnv(recorder) }, timeout: 10_000 },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(2)
    const asked = readFileSync(recorded, 'utf8')
    expect(asked).toContain('repos/named-owner/named-repo/actions/runs/7')
    expect(asked).not.toContain('nemori-ai')
  })
})
