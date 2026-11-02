// `model-profiles` row: model-host-local `ModelProfilesLocalPlugin` as a row. It injects nothing.
// The profiles are the official OpenAI snapshot; the test reads them through the row's service.
import { describe, expect, it } from 'vitest'
import type { ModelProfile } from '@omne-harness/model-contract'
import { ModelProfilesService } from '@omne-harness/model-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT, withLiveRows } from './support.ts'

const plugins = { modelProfilesRow }
const config = {
  // A judged adoption digest is 64 hex characters; the profile judge refuses anything else at use.
  retryPolicy: {
    owner: 'harness-server-release',
    name: 'retry',
    revision: '1',
    digest: '0'.repeat(64),
  },
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
}
const rows = [{ id: 'model-profiles', plugin: 'modelProfilesRow', config }]
const REQUIRED = {
  modalities: ['text'] as ['text'],
  source: { owner: 'test', record: 'required', revision: '1', digest: '1'.repeat(64) },
}
const ACCESS = { principal: Object.freeze({ subject: 'test' }), tenant: TENANT }

describe('the model-profiles row', () => {
  it('declares the formal key, no inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelProfilesRow)).toEqual({
      row: 'model-profiles',
      implementation: 'real',
      manifest: { provides: ['modelProfiles'], injects: [], phase: null, sameProviderGroup: null },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE and lists the official profiles, each with the configured retry policy and time', async () => {
    const { value, run } = await withLiveRows(
      { rows, plugins, probe: ['modelProfiles'] },
      async ctx => {
        const service = ctx.get('modelProfiles') as ModelProfilesService<unknown>
        const listed = await service.list({ ...ACCESS, selected: null, required: REQUIRED })
        return { isService: service instanceof ModelProfilesService, listed }
      },
    )
    expect(value.isService).toBe(true)
    if (!('ok' in value.listed)) throw new Error(`list failed: ${JSON.stringify(value.listed)}`)
    const profiles: ModelProfile[] = []
    for (const choice of value.listed.ok.choices) {
      if (choice.kind === 'resolved') profiles.push(choice.profile)
    }
    expect(profiles.length).toBeGreaterThan(0)
    for (const profile of profiles) {
      expect(profile.identity.scope).toEqual({ kind: 'factory' })
      expect(profile.updatedAt).toBe(config.updatedAt)
      expect(profile.definition.retryPolicy).toEqual(config.retryPolicy)
    }
    expect(run.state('model-profiles')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.result.exitCode).toBe(0)
  })

  it('resolves a route of the snapshot to its profile', async () => {
    const { value } = await withLiveRows({ rows, plugins, probe: ['modelProfiles'] }, async ctx => {
      const service = ctx.get('modelProfiles') as ModelProfilesService<unknown>
      return service.resolve({ ...ACCESS, route: 'openai/gpt-5.6-sol', required: REQUIRED })
    })
    expect(value).toMatchObject({ ok: { kind: 'resolved' } })
  })

  it('does not start with a compaction percent outside 1 to 100', async () => {
    const run = await serveOnce({
      distribution: {
        rows: [
          {
            id: 'model-profiles',
            plugin: 'modelProfilesRow',
            config: { ...config, compactionTriggerPercent: '101' },
          },
        ],
      },
      plugins,
    })
    expect(run.result.exitCode).not.toBe(0)
    expect(run.state('model-profiles')?.['state']).not.toBe('ACTIVE')
  })
})
