import { describe, expect, it } from 'vitest'
import type { WorkspaceCarrierManifest } from '@omne-harness-lite/asset-model'
import { readWorkspaceCarrier } from '../src/index.ts'
import { workspace, shell } from './fixtures.ts'

describe('complete workspace carrier input domain', () => {
  const connector = { category: 'connector', name: 'external' } as const
  const manifest: WorkspaceCarrierManifest = {
    format: 1,
    assets: [{ capability: connector, source: 'connectors/external.json' }],
    assignments: [
      {
        capability: connector,
        item: 'unknown-property',
        value: { category: 'connector' },
        immutable: false,
      },
      { capability: shell, item: 'execute', value: { allowed: ['auto'] } },
    ],
    disabled: [connector, shell],
  }
  it('Connector identifiers, opaque values, and unknown attribute assignments are admitted', () => {
    const result = readWorkspaceCarrier(manifest, workspace)
    if (!('ok' in result)) throw new Error('carrier failed')
    expect(result.ok.holdings[0]?.capability).toEqual(connector)
    expect(result.ok.holdings[0]?.assignments).toEqual([
      { item: 'unknown-property', value: { category: 'connector' }, immutable: false },
      { item: 'disabled', value: true, immutable: false },
    ])
    expect(result.ok.dropped).toEqual([
      { capability: connector, item: 'unknown-property', reason: 'immutable_flag' },
      { capability: shell, item: 'execute', reason: 'unknown_asset' },
      { capability: shell, reason: 'unknown_asset' },
    ])
    expect(Object.isFrozen(result.ok.holdings[0]?.assignments[0]?.value)).toBe(true)
    expect(Object.isFrozen(manifest.assignments[0]?.value)).toBe(false)
  })
  const invalid: readonly { name: string; value: WorkspaceCarrierManifest }[] = [
    {
      name: 'duplicate assets',
      value: { ...manifest, assets: [...manifest.assets, ...manifest.assets] },
    },
    {
      name: 'duplicate assignment pair',
      value: { ...manifest, assignments: [...manifest.assignments, ...manifest.assignments] },
    },
    {
      name: 'disabled in assignments',
      value: {
        ...manifest,
        assignments: [{ capability: connector, item: 'disabled', value: true }],
      },
    },
    {
      name: 'source escapes',
      value: { ...manifest, assets: [{ capability: connector, source: '../escape.json' }] },
    },
    { name: 'format unrecognized', value: { ...manifest, format: 2 } },
  ]
  for (const example of invalid)
    it(example.name, () =>
      expect(readWorkspaceCarrier(example.value, workspace)).toHaveProperty('invalidInput'),
    )
  for (const missing of ['assets', 'assignments', 'disabled'] as const)
    it(`missing ${missing} is invalid`, () => {
      const { [missing]: _ignored, ...incomplete } = manifest
      // @ts-expect-error Deliberately exercise a missing required manifest list.
      expect(readWorkspaceCarrier(incomplete, workspace)).toHaveProperty('invalidInput')
    })
})
