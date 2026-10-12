import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LosslessNumber, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import type { EvaluationInput } from '../src/types.ts'
import { canonical, copyJson, evaluationInputFingerprint } from '../src/json.ts'
import { e1, at, assignment, shell, tenant, bob } from './fixtures.ts'

describe('full input fingerprint independently varied fields', () => {
  it('covers every S15#7 listed input and nested identity/version/body facts', () => {
    const original = e1()
    const hash = evaluationInputFingerprint(original)
    const changes: EvaluationInput[] = [
      { ...original, tenant: { ...tenant, account: bob.account } },
      { ...original, standing: { standing: 'effective', role: 'superAdministrator' } },
      { ...original, workspace: { ...original.workspace, tenant, directory: '/different' } },
      { ...original, session: [{ capability: shell, assignment: assignment('timeout', 'PT3S') }] },
      {
        ...original,
        holdings: original.holdings.map((entry, index) =>
          index === 0 ? { ...entry, since: '2026-09-24T08:00:00Z' } : entry,
        ),
      },
      {
        ...original,
        holdings: original.holdings.map((entry, index) =>
          index === 3 ? { ...entry, versionSelection: { kind: 'pinned', number: 1 } } : entry,
        ),
      },
      {
        ...original,
        definitions: original.definitions.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                draft: { category: 'agent_definition', body: toOpaqueJson({ key: 'changed' }) },
              }
            : entry,
        ),
      },
      { ...original, root: { ...original.root, references: [] } },
      { ...original, mcpActionSets: [] },
      {
        ...original,
        mcpActionSets:
          original.mcpActionSets?.map(entry => ({
            ...entry,
            actions: { kind: 'fetched', fetchedAt: at, tools: [] },
          })) ?? [],
      },
    ]
    for (const change of changes) expect(evaluationInputFingerprint(change)).not.toBe(hash)
  })
  it('object member order is immaterial, including integer-looking and Unicode keys', () => {
    const original = e1()
    const reversed = {
      root: {
        references: original.root.references,
        definition: original.root.definition,
        attributes: original.root.attributes,
        source: original.root.source,
      },
      definitions: original.definitions,
      holdings: original.holdings,
      tenant: { account: tenant.account, organization: tenant.organization },
      standing: original.standing,
      workspace: { directory: original.workspace?.directory ?? '/', tenant },
      session: original.session ?? [],
      mcpActionSets: original.mcpActionSets ?? [],
    }
    expect(evaluationInputFingerprint(reversed)).toBe(evaluationInputFingerprint(original))
    const keys = { '😀': 0, '\uE000': 1, '2': 2, '10': 10 }
    expect(canonical(keys)).toBe('{"10":10,"2":2,"\uE000":1,"😀":0}')
    expect(canonical({ '10': 10, '2': 2, '\uE000': 1, '😀': 0 })).toBe(canonical(keys))
  })
  it('numeric source spells are retained and plain numbers remain numbers', () => {
    const original = e1()
    const v = original.definitions[0]
    if (v === undefined) throw new Error('fixture missing definition')
    const numeric = {
      ...original,
      definitions: [
        {
          ...v,
          versions: v.versions.map(entry => ({ ...entry, number: new LosslessNumber('1.0') })),
        },
        ...original.definitions.slice(1),
      ],
    }
    expect(evaluationInputFingerprint(numeric)).not.toBe(evaluationInputFingerprint(original))
    expect(original.definitions[0]?.versions[0]?.number).toBe(1)
  })
  it('a manually written canonical input byte string is the SHA-256 oracle', () => {
    const input: EvaluationInput = {
      tenant,
      standing: { standing: 'effective', role: 'member' },
      root: {
        definition: { category: 'agent_definition', name: 'assistant' },
        references: [],
        attributes: [],
        source: { asset: 'ast_root', version: 1 },
      },
      holdings: [],
      definitions: [],
    }
    const bytes =
      '{"definitions":[],"holdings":[],"root":{"attributes":[],"definition":{"category":"agent_definition","name":"assistant"},"references":[],"source":{"asset":"ast_root","version":1}},"standing":{"role":"member","standing":"effective"},"tenant":{"account":"acc_alice","organization":"org_acme"}}'
    expect(evaluationInputFingerprint(input)).toBe(
      createHash('sha256').update(bytes, 'utf8').digest('hex'),
    )
  })
  it('opaque values use the explicit JSON read boundary rather than their private wrapper', () => {
    const opaque = toOpaqueJson({ value: 'ordinary content', category: 'connector' })
    expect(canonical(copyJson(opaque))).toBe('{"category":"connector","value":"ordinary content"}')
    expect(canonical(copyJson({ negativeZero: -0, n: new LosslessNumber('1e1000') }))).toBe(
      '{"n":1e1000,"negativeZero":-0}',
    )
  })
})
