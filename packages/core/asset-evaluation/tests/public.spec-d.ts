import { expectTypeOf, it } from 'vitest'
import type { AssetDefinition, WorkspaceCarrierManifest } from '@omne-harness-lite/asset-model'
import {
  evaluate,
  readWorkspaceCarrier,
  defaultBodyContracts,
  evaluationInputFingerprint,
  type EvaluationInput,
  type NonConnectorEvaluationInput,
  type NonConnectorAssetDefinition,
  type NonConnectorAssetContent,
  type EvaluationResult,
  type CarrierReadOutcome,
  type NonConnectorBodyContracts,
} from '../src/v3/index.ts'

declare const complete: EvaluationInput
declare const input: NonConnectorEvaluationInput

it('full input and narrowed operation remain distinct', () => {
  expectTypeOf<EvaluationInput>().toEqualTypeOf<Parameters<typeof evaluationInputFingerprint>[0]>()
  expectTypeOf<NonConnectorEvaluationInput>().toEqualTypeOf<Parameters<typeof evaluate>[0]>()
  expectTypeOf<ReturnType<typeof evaluate>>().toEqualTypeOf<EvaluationResult>()
  expectTypeOf<
    Parameters<typeof readWorkspaceCarrier>[0]
  >().toEqualTypeOf<WorkspaceCarrierManifest>()
  expectTypeOf<ReturnType<typeof readWorkspaceCarrier>>().toEqualTypeOf<CarrierReadOutcome>()
  expectTypeOf(defaultBodyContracts).toEqualTypeOf<NonConnectorBodyContracts>()
  evaluationInputFingerprint(complete)
  // @ts-expect-error A full domain may contain actual Connector records or bodies.
  evaluate(complete)
  // @ts-expect-error Connector is absent from the real five-provider root.
  defaultBodyContracts.connector.judge({})
})

it('Connector is excluded at every actual content position', () => {
  const connector = { category: 'connector', body: {} } as const
  // @ts-expect-error Actual Connector content is outside the operation domain.
  const rejected: NonConnectorAssetContent = connector
  const full: AssetDefinition = {
    id: 'ast_connector',
    origin: 'official',
    capability: { category: 'connector', name: 'external' },
    versions: [{ number: 1, content: connector, publishedAt: '2026-09-24T09:00:00Z' }],
  }
  // @ts-expect-error The identifier in the actual definition record excludes Connector.
  const record: NonConnectorAssetDefinition = full
  const valid = { category: 'tool', name: 'simple' } as const
  const draft: NonConnectorAssetDefinition = {
    ...full,
    capability: valid,
    // @ts-expect-error A Connector draft is unavailable even if a published version is ordinary.
    draft: connector,
    versions: [],
  }
  // @ts-expect-error Every historical version must also be in the available actual-body domain.
  const historical: NonConnectorAssetDefinition = { ...full, capability: valid }
  void [rejected, record, draft, historical]
})

it('ordinary references and holdings may identify Connector without requiring its body', () => {
  const connector = { category: 'connector', name: 'external' } as const
  evaluate({ ...input, root: { ...input.root, references: [{ capability: connector }] } })
  readWorkspaceCarrier(
    {
      format: 1,
      assets: [{ capability: connector, source: 'connectors/external.json' }],
      assignments: [],
      disabled: [],
    },
    input.workspace ?? { tenant: input.tenant, directory: '/repo' },
  )
})
