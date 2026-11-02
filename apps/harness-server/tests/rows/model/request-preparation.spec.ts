// `model-request-preparation` row: the model-host-local preparation plugin over the real OpenAI
// family. The row injects `modelCommands`, and the real `model-records` row has no member yet, so the
// tests load a named stand-in row of that name (support.ts). A lease without a lineage never reads
// it. The profile comes from the real `model-profiles` row; the family, its tokenizer and its rules
// are the real ones. No network is involved.
import { describe, expect, it } from 'vitest'
import type { AssembledModelInput, ModelProfile } from '@omne-harness/model-contract'
import {
  ModelPreparationResourcesService,
  ModelRequestPreparationService,
} from '@omne-harness/model-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { modelRequestPreparationRow } from '../../../src/rows/model-request-preparation/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT, commandsStandIn, withLiveRows } from './support.ts'

const ADOPTION = {
  owner: 'harness-server-test',
  name: 'preparation',
  revision: '1',
  digest: '0'.repeat(64),
}
const count = 65_536
const config = {
  maxCitedCalls: 8,
  openai: {
    limits: {
      toolArguments: {
        maxBytes: count,
        maxDepth: 32,
        maxItems: 1_024,
        maxMembers: 256,
        maxStringLength: count,
        maxNumberLength: 64,
      },
      maxReasoningText: count,
    },
    margin: { percent: '10', source: ADOPTION },
  },
}
const profilesConfig = {
  retryPolicy: ADOPTION,
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
}
const plugins = { modelProfilesRow, modelRequestPreparationRow, commandsStandIn }
const rows = [
  { id: 'model-records', plugin: 'commandsStandIn' },
  { id: 'model-profiles', plugin: 'modelProfilesRow', config: profilesConfig },
  { id: 'model-request-preparation', plugin: 'modelRequestPreparationRow', config },
]
const probe = ['modelProfiles', 'modelRequestPreparation', 'modelPreparationResources']
const REQUIRED = {
  modalities: ['text'] as ['text'],
  source: { owner: 'test', record: 'required', revision: '1', digest: '1'.repeat(64) },
}
const ACCESS = { principal: Object.freeze({ subject: 'test' }), tenant: TENANT }

async function profileOf(ctx: { get(name: string): unknown }): Promise<ModelProfile> {
  const profiles = ctx.get('modelProfiles') as ModelProfilesLike
  const resolved = await profiles.resolve({
    ...ACCESS,
    route: 'openai/gpt-5.6-sol',
    required: REQUIRED,
  })
  if (!('ok' in resolved) || resolved.ok.kind !== 'resolved')
    throw new Error('profile did not resolve')
  return resolved.ok.profile
}
type ModelProfilesLike = {
  resolve(
    input: unknown,
  ): Promise<
    { ok: { kind: 'resolved'; profile: ModelProfile } | { kind: 'absent' } } | { failure: unknown }
  >
}

describe('the model-request-preparation row', () => {
  it('declares the formal key, the commands inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelRequestPreparationRow)).toEqual({
      row: 'model-request-preparation',
      implementation: 'real',
      manifest: {
        provides: ['modelRequestPreparation'],
        injects: ['modelCommands'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE and provides the preparation service and the metering leases', async () => {
    const { value, run } = await withLiveRows({ rows, plugins, probe }, ctx => ({
      prepare: ctx.get('modelRequestPreparation') instanceof ModelRequestPreparationService,
      leases: ctx.get('modelPreparationResources') instanceof ModelPreparationResourcesService,
    }))
    expect(value).toEqual({ prepare: true, leases: true })
    expect(run.state('model-request-preparation')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.result.exitCode).toBe(0)
  })

  it('gives a lease over the real OpenAI family for an official profile and takes it back', async () => {
    const { value } = await withLiveRows({ rows, plugins, probe }, async ctx => {
      const profile = await profileOf(ctx)
      const leases = ctx.get(
        'modelPreparationResources',
      ) as ModelPreparationResourcesService<unknown>
      const leased = await leases.acquire({ ...ACCESS, profile })
      if (!('ok' in leased)) return { leased, suppliers: null, released: null, expected: [] }
      const suppliers = leased.ok.bindings.map(binding => binding.supplier)
      const released = await leased.ok.release()
      return { leased: null, suppliers, released, expected: profile.definition.suppliers }
    })
    if (value.suppliers === null) throw new Error(`lease refused: ${JSON.stringify(value.leased)}`)
    expect(value.suppliers.map(supplier => supplier.credential)).toEqual(
      value.suppliers.map(() => ({ kind: 'factory' })),
    )
    expect(value.suppliers.map(supplier => [supplier.recipient, supplier.model])).toEqual(
      value.expected.map(supplier => [supplier.recipient, supplier.model]),
    )
    expect(value.released).toEqual({})
  })

  it('prepares a fixed request for a text input and keeps the profile adoption', async () => {
    const { value } = await withLiveRows({ rows, plugins, probe }, async ctx => {
      const profile = await profileOf(ctx)
      const assembled: AssembledModelInput = {
        system: [],
        // Ids and blocks are branded types that `prepare` judges itself, so the literal is cast.
        messages: [
          {
            id: `msg_${'u1'.padEnd(22, '0')}`,
            role: 'user',
            blocks: [
              {
                kind: 'text',
                id: 'b-u1',
                visibility: { toHuman: true, toModel: true },
                text: 'hello',
              },
            ],
          },
        ] as unknown as AssembledModelInput['messages'],
        tools: [],
        toolChoice: 'none',
        parameters: [],
        // The family accepts only the representation its profile declares.
        representation: profile.definition.representation,
        source: ADOPTION,
      }
      const preparation = ctx.get(
        'modelRequestPreparation',
      ) as ModelRequestPreparationService<unknown>
      return {
        profile,
        prepared: await preparation.prepare({ ...ACCESS, profile, required: REQUIRED, assembled }),
      }
    })
    if (!('ok' in value.prepared))
      throw new Error(`prepare refused: ${JSON.stringify(value.prepared)}`)
    expect(value.prepared.ok.profile).toEqual(value.profile.adoption)
    expect(value.prepared.ok.messages).toHaveLength(1)
    expect(value.prepared.ok.suppliers[0]?.credential).toEqual({ kind: 'factory' })
  })

  it('stays PENDING without modelCommands and names the missing key', async () => {
    const run = await serveOnce({
      distribution: { rows: rows.slice(2) },
      plugins,
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.state('model-request-preparation')).toMatchObject({
      state: 'PENDING',
      missing: ['modelCommands'],
    })
  })

  it('does not start when a configured bound is missing', async () => {
    const { maxCitedCalls: _omitted, ...incomplete } = config
    const run = await serveOnce({
      distribution: {
        rows: [rows[0]!, { ...rows[2]!, config: incomplete }].map(row => ({ config: {}, ...row })),
      },
      plugins,
    })
    expect(run.result.exitCode).not.toBe(0)
    expect(run.state('model-request-preparation')?.['state']).not.toBe('ACTIVE')
  })
})
