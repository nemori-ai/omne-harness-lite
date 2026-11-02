// @module-tag slow
// `identity` 行（验收 3）：以 `serve` 模式只装本行、它依赖的 `storage` 夹具行与 `identityClock` 入口对象。
// 慢：插件体用部署的 `SCRYPT_PROFILE` 派生假材料，并在真实 sqlite-provider 上登记组合。
import { describe, expect, it } from 'vitest'
import { IDENTITY_SQL_DEFAULT_CONFIG } from '@omne-harness/identity-sql'
import { stubPlugin } from '../../../src/cordis.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { identityRow } from '../../../src/rows/identity/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { fixtureSqliteStorage } from './fixtures.ts'

const plugins = { stubPlugin, fixtureSqliteStorage, identityRow }
const distribution = {
  rows: [
    { id: 'storage', plugin: 'fixtureSqliteStorage', config: {} },
    { id: 'identity', plugin: 'identityRow', config: IDENTITY_SQL_DEFAULT_CONFIG },
  ],
}

describe('the identity row', () => {
  it('declares the identity row: real, no shutdown phase, the formal keys', () => {
    expect(rowDeclarationOf(identityRow)).toEqual({
      row: 'identity',
      implementation: 'real',
      manifest: {
        provides: ['identityOperations', 'tenantStanding'],
        injects: ['storage', 'identityClock'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it(
    'is ACTIVE in serve mode with the storage fixture row and the identityClock entry object',
    { timeout: 120_000 },
    async () => {
      const run = await serveOnce({
        distribution,
        plugins,
        entryObjects: [identityClock],
        readinessTimeoutMs: 60_000,
        shutdownDeadlineMs: 30_000,
      })
      expect(run.stderr).toEqual(['serve: stop requested: test: startup seen'])
      expect(run.result.exitCode).toBe(0)
      expect(run.tree('identity')).toMatchObject({ plugin: 'identityRow', implementation: 'real' })
      expect(run.state('identity')).toMatchObject({ state: 'ACTIVE', missing: [] })
      expect(run.startup).toMatchObject({
        accepting: true,
        outcome: 'ready',
        appliedRows: ['storage', 'identity'],
        implementations: { real: 2, 'contract-double': 0, 's0-double': 0 },
      })
      expect(run.of('entry-object').find(r => r['name'] === 'identityClock')).toEqual({
        kind: 'entry-object',
        name: 'identityClock',
        implementation: 'real',
        trusted: false,
      })
      expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    },
  )

  it(
    'without the identityClock entry object stays PENDING and names the missing key',
    { timeout: 120_000 },
    async () => {
      const run = await serveOnce({ distribution, plugins, entryObjects: [] })
      expect(run.result.exitCode).toBe(4)
      expect(run.state('identity')).toMatchObject({
        state: 'PENDING',
        missing: ['identityClock'],
      })
      expect(run.state('storage')).toMatchObject({ state: 'ACTIVE' })
      expect(run.of('entry-object').map(r => r['name'])).not.toContain('identityClock')
      expect(run.startup).toMatchObject({ accepting: false, outcome: 'pending' })
      expect(run.startup['appliedRows']).toEqual(['storage'])
    },
  )
})
