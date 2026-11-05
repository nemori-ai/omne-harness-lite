// @module-tag slow
// AC-2 (identity spec), second half, and the 001 to 002 upgrade (SPEC IS-09). Slow: every phase is
// a separate Node process over one storage root (`fixtures/governance-child.ts`).
//   A revocation outlives the process: the first process revokes a login and exits, the second
//   finds it invalid and the other login recognized. Both processes exit with 0.
//   Upgrade: the first process is the published 001 build; the second is this build over the same
//   files, whose registration runs 002; the third opens them again with nothing left to migrate.
import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'
import { temporaryRoot } from './fixtures/storage.ts'

const run = promisify(execFile)
const CHILD = fileURLToPath(new URL('./fixtures/governance-child.ts', import.meta.url))

const roots: string[] = []
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

/** Runs one phase; a non-zero exit rejects. Returns the exit code and the one JSON line. */
async function phase(storageRoot: string, name: string, stateFile: string) {
  const { stdout, stderr } = await run(process.execPath, [CHILD, storageRoot, name, stateFile], {
    timeout: 60_000,
  })
  if (stderr.trim() !== '') throw new Error(`${name}: ${stderr}`)
  return { exitCode: 0, output: JSON.parse(stdout) as Record<string, unknown> }
}

async function newRoot() {
  const root = await temporaryRoot()
  roots.push(root)
  return { storageRoot: join(root, 'storage'), stateFile: join(root, 'state.json') }
}

describe('governance records across processes', () => {
  it(
    'keeps a revoked login invalid after a restart (revoked-stays-invalid-after-restart)',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const { storageRoot, stateFile } = await newRoot()
      const first = await phase(storageRoot, 'revoke-first', stateFile)
      expect(first).toEqual({
        exitCode: 0,
        output: {
          phase: 'revoke-first',
          registered: 'registered',
          revocation: 'succeeded',
          before: 'invalid',
        },
      })
      const second = await phase(storageRoot, 'revoke-second', stateFile)
      expect(second).toEqual({
        exitCode: 0,
        output: {
          phase: 'revoke-second',
          registered: 'registered',
          revoked: 'invalid',
          keeper: 'recognized',
        },
      })
    },
  )

  it(
    'upgrades a 001 domain to 002: the old account and login work, then governance writes stay',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const { storageRoot, stateFile } = await newRoot()
      const legacy = await phase(storageRoot, 'legacy-first', stateFile)
      expect(legacy.output).toMatchObject({ registered: 'registered', register: 'committed' })
      expect(legacy.output['issue']).toBe('committed')
      // The 001 build registered another combination version than this build.
      expect(legacy.output['legacyVersion']).not.toBe(legacy.output['currentVersion'])

      const upgraded = await phase(storageRoot, 'upgrade-second', stateFile)
      const state = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, string>
      expect(upgraded.output).toEqual({
        phase: 'upgrade-second',
        registered: 'registered',
        recognized: 'recognized',
        recognizedLogin: { ok: true, value: state['login'] },
        recognizedTenant: { ok: true, value: state['tenant'] },
        recognizedAccount: { ok: true, value: state['account'] },
        validLogins: 2,
        currentTenant: { ok: true, value: state['tenant'] },
        created: 'succeeded',
        revoked: 'succeeded',
        after: 'invalid',
      })

      const reopened = await phase(storageRoot, 'upgrade-third', stateFile)
      expect(reopened.output).toEqual({
        phase: 'upgrade-third',
        registered: 'registered',
        old: 'invalid',
        fresh: 'recognized',
        memberships: ['super-admin', 'super-admin'],
      })
    },
  )
})
