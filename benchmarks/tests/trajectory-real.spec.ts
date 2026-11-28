// @module-tag slow
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { accountedFor } from '../src/coverage.ts'
import { LIST } from '../src/script.ts'
import { ROOT } from '../src/setting.ts'
import { runRounds } from '../src/trajectory.ts'

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'benchmarks-real-')))
afterAll(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('a trajectory on a lab server of this checkout', () => {
  it(
    'runs two rounds through the real server and client, restarts between them, opens an observation, and reads what the storage counted',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const trajectory = await runRounds(
        { root: ROOT, dataDirectory: directory },
        [{ steps: [[LIST], [LIST]] }, { steps: [[LIST]] }],
        { restartBefore: [2], watchAfter: [2] },
      )
      expect(trajectory.steps.map(step => [step.round, step.step])).toEqual([
        [1, 1],
        [1, 2],
        [2, 1],
      ])
      for (const step of trajectory.steps) {
        expect(step.commits).toBeGreaterThan(0)
        expect(step.reads).toBeGreaterThan(0)
        expect(step.otherRequests).toBe(0)
        expect(Object.keys(step.byHandler).some(name => name.startsWith('tenant-1/'))).toBe(true)
        expect(JSON.stringify(step)).not.toMatch(/org_|acc_/u)
      }
      expect(trajectory.steps[1]?.requestBytes).toBeGreaterThan(
        trajectory.steps[0]?.requestBytes ?? 0,
      )
      expect(trajectory.openings.map(opening => opening.cold)).toEqual([false, true])
      expect(trajectory.watchings).toHaveLength(5)
      for (const watching of trajectory.watchings) expect(watching.commits).toBe(0)
      expect(trajectory.requests).toBe(5)
      expect(trajectory.kinds).toMatchObject({ 'message.user': 2, 'run.terminal': 2 })
      expect(trajectory.digests.length).toBeGreaterThan(8)
      expect(accountedFor(trajectory.entryKinds)).toEqual({ unlisted: [], gone: [] })
      expect(trajectory.rounds.map(round => round.round)).toEqual([1, 2])
    },
  )
})
