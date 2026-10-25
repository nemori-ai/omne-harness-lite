// The object chain and R1–R5 as pure functions: each case names the SPEC row or rule it would
// catch a wrong implementation of (SPEC「定义完整性与呈现」「会话常驻规则（R1–R5）」「采用点判定」
// 「刷新点允许的变化」, G7 binding keys).
import { describe, expect, it } from 'vitest'
import { type SourceLayer, type ToolDefinition } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  foldResident,
  planAdoption,
  refreshAvailability,
  sameBindingKey,
  sameShape,
  sameSourceLayer,
  shapeOf,
  type AdoptionFacts,
  type AdoptionPlan,
  type ToolBindingKey,
  type ToolReloadResult,
} from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  adoption,
  commandsDefinition,
  declarations,
  evidence,
  functionDefinition,
  governance,
  json,
  parameters,
} from './tool-values.ts'

const tenantA = () =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
const tenantB = () =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')

function key(
  name: string,
  layer: SourceLayer = { kind: 'official' },
  version = '1',
): ToolBindingKey {
  return { layer, asset: { name, adoption: { ...adoption(name), revision: version } } }
}

type FunctionDefinition = Extract<ToolDefinition, { kind: 'function' }>

/** The function definition of the fixtures, narrowed so a test can vary one field of its shape. */
function fn(): FunctionDefinition {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('function')
  return definition
}

describe('deriveDefinition', () => {
  it('takes identity and governance from the asset and the rest from the implementation', () => {
    const facts = {
      implements: { kind: 'function', parameters: parameters(), returns: fn().returns },
      description: 'Reads one file.',
      backgroundAllowed: true,
      declarations: declarations(),
    } as const
    const derived = deriveDefinition(
      { ...governance('other_name'), requiredCapabilities: ['network'], programmable: false },
      facts,
    )
    expect(derived).toEqual({
      adoption: adoption('other_name'),
      name: 'other_name',
      requiredCapabilities: ['network'],
      programmable: false,
      description: 'Reads one file.',
      backgroundAllowed: true,
      declarations: declarations(),
      kind: 'function',
      parameters: parameters(),
      returns: fn().returns,
    })
    expect(Object.isFrozen(derived)).toBe(true)
    // definition.adoption is the asset version, never the implementation's executor or declarations.
    expect(derived.adoption).toEqual(adoption('other_name'))
  })

  it('keeps a command table as the implementation projected it', () => {
    const source = commandsDefinition()
    if (source.kind !== 'commands') throw new Error('commands')
    const derived = deriveDefinition(governance('files'), {
      implements: { kind: 'commands', commands: source.commands },
      description: source.description,
      backgroundAllowed: source.backgroundAllowed,
      declarations: source.declarations,
    })
    // The fixture keeps the read_file adoption under the files name; the asset version wins.
    expect(derived).toEqual({
      ...source,
      adoption: adoption('files'),
      requiredCapabilities: ['file-system'],
    })
  })
})

describe('shapeOf and sameShape', () => {
  it('reads name, kind, the canonical parameter contract and the vocabulary identity only', () => {
    const base = fn()
    const shape = shapeOf(base)
    expect(shape).toEqual({
      name: 'read_file',
      kind: 'function',
      parameters: {
        kind: 'declared',
        schema: '{"properties":{"path":{"type":"string"}},"type":"object"}',
        vocabulary: { owner: 'test-owner', name: 'json-schema', digest: 'sha256:json-schema' },
      },
    })
    // Description, parameter descriptions, returns, declarations, adoption, vocabulary revision: no part.
    const varied: ToolDefinition = {
      ...base,
      adoption: adoption('v2'),
      description: 'Another text.',
      backgroundAllowed: true,
      requiredCapabilities: [],
      programmable: true,
      declarations: { ...declarations(), inputModalities: ['text'] },
      returns: { kind: 'structured', program: { kind: 'none' } },
      parameters: {
        ...base.parameters,
        vocabulary: { ...base.parameters.vocabulary, revision: '9' },
        descriptions: [{ path: 'path', text: 'Other words.' }],
      },
    }
    expect(sameShape(shapeOf(varied), shape)).toBe(true)
  })

  it('compares the schema as canonical text: key order does not matter, a different schema does', () => {
    const base = fn()
    const reordered: ToolDefinition = {
      ...base,
      parameters: {
        ...base.parameters,
        schema: json('{"properties":{"path":{"type":"string"}},"type":"object"}'),
      },
    }
    expect(sameShape(shapeOf(reordered), shapeOf(base))).toBe(true)
    const widened: ToolDefinition = { ...base, parameters: parameters(['path', 'encoding']) }
    expect(sameShape(shapeOf(widened), shapeOf(base))).toBe(false)
    const renamed: ToolDefinition = { ...base, name: 'read_text' }
    expect(sameShape(shapeOf(renamed), shapeOf(base))).toBe(false)
    const other: ToolDefinition = {
      ...base,
      parameters: { ...base.parameters, vocabulary: adoption('other-vocabulary') },
    }
    expect(sameShape(shapeOf(other), shapeOf(base))).toBe(false)
  })

  it('sorts the command table by name and keeps the executor-owned mark', () => {
    const source = commandsDefinition()
    if (source.kind !== 'commands') throw new Error('commands')
    const reversed: ToolDefinition = { ...source, commands: [...source.commands].reverse() }
    const shape = shapeOf(source)
    expect(shape).toMatchObject({
      kind: 'commands',
      commands: [
        { name: 'read', parameters: { kind: 'declared' } },
        { name: 'shell', parameters: { kind: 'executor-owned' } },
      ],
    })
    expect(sameShape(shapeOf(reversed), shape)).toBe(true)
    const summarised: ToolDefinition = {
      ...source,
      commands: source.commands.map(command => ({ ...command, summary: 'Changed.' })),
    }
    expect(sameShape(shapeOf(summarised), shape)).toBe(true)
    const dropped: ToolDefinition = { ...source, commands: source.commands.slice(0, 1) }
    expect(sameShape(shapeOf(dropped), shape)).toBe(false)
    expect(sameShape(shapeOf(functionDefinition()), shape)).toBe(false)
  })
})

describe('source layers and binding keys (G7)', () => {
  it('compares a layer by position and identity text', () => {
    const organization = tenantA().organization
    const pairs: readonly (readonly [SourceLayer, SourceLayer, boolean])[] = [
      [{ kind: 'official' }, { kind: 'official' }, true],
      [{ kind: 'official' }, { kind: 'organization', organization }, false],
      [
        { kind: 'organization', organization },
        { kind: 'organization', organization: tenantA().organization },
        true,
      ],
      [
        { kind: 'organization', organization },
        { kind: 'organization', organization: tenantB().organization },
        false,
      ],
      [{ kind: 'tenant', tenant: tenantA() }, { kind: 'tenant', tenant: tenantA() }, true],
      [{ kind: 'tenant', tenant: tenantA() }, { kind: 'tenant', tenant: tenantB() }, false],
      [{ kind: 'tenant', tenant: tenantA() }, { kind: 'organization', organization }, false],
      [
        { kind: 'workspace', workspace: 'ws_a' as never },
        { kind: 'workspace', workspace: 'ws_a' as never },
        true,
      ],
      [
        { kind: 'workspace', workspace: 'ws_a' as never },
        { kind: 'workspace', workspace: 'ws_b' as never },
        false,
      ],
    ]
    for (const [left, right, same] of pairs) expect(sameSourceLayer(left, right)).toBe(same)
  })

  it('a binding key is the layer, the capability name and the asset version together', () => {
    expect(sameBindingKey(key('read_file'), key('read_file'))).toBe(true)
    expect(sameBindingKey(key('read_file'), key('read_file', { kind: 'official' }, '2'))).toBe(
      false,
    )
    expect(sameBindingKey(key('read_file'), key('write_file'))).toBe(false)
    expect(
      sameBindingKey(key('read_file'), key('read_file', { kind: 'tenant', tenant: tenantA() })),
    ).toBe(false)
  })
})

describe('planAdoption: the adoption-point table', () => {
  const recordedKey = key('read_file')
  const winnerKey = key('read_file', { kind: 'official' }, '2')
  const fallbackKey = key('read_file', { kind: 'tenant', tenant: tenantA() })
  const same = shapeOf(functionDefinition())
  const different = shapeOf({ ...fn(), parameters: parameters(['path', 'mode']) })
  const durable = evidence('missing-package')

  function facts(input: {
    usable: boolean
    sameShape?: readonly ToolBindingKey[]
    winner?: 'same' | 'different' | null
    reload?: ToolReloadResult | null
  }): AdoptionFacts {
    const winner =
      input.winner === 'same'
        ? { key: winnerKey, shape: same }
        : input.winner === 'different'
          ? { key: winnerKey, shape: different }
          : null
    return {
      recorded: { key: recordedKey, shape: same, usable: input.usable },
      sameShape: input.sameShape ?? [],
      winner,
      reload: input.reload ?? null,
    }
  }

  const rows: readonly (readonly [string, AdoptionFacts, AdoptionPlan])[] = [
    [
      'row 1: recorded usable, winner same shape → advance',
      facts({ usable: true, winner: 'same' }),
      { kind: 'advance', key: winnerKey },
    ],
    [
      'row 2: recorded usable, no winner → keep (R5a)',
      facts({ usable: true, winner: null }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 2: recorded usable, different winner → keep (R5a)',
      facts({ usable: true, winner: 'different' }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 3: recorded unusable, same-shape contribution, winner same → advance',
      facts({ usable: false, sameShape: [fallbackKey], winner: 'same' }),
      { kind: 'advance', key: winnerKey },
    ],
    [
      'row 4: recorded unusable, same-shape contribution, no winner → fallback order',
      facts({ usable: false, sameShape: [fallbackKey, winnerKey], winner: null }),
      { kind: 'fallback', key: fallbackKey },
    ],
    [
      'row 4: recorded unusable, same-shape contribution, different winner → fallback order',
      facts({ usable: false, sameShape: [fallbackKey], winner: 'different' }),
      { kind: 'fallback', key: fallbackKey },
    ],
    [
      'row 5: recorded unusable, nothing same-shape, winner same → advance; the coordinator loads it',
      facts({ usable: false, winner: 'same' }),
      { kind: 'advance', key: winnerKey },
    ],
    [
      'row 6: recorded unusable, nothing same-shape, no winner → the coordinator reloads the recorded key first',
      facts({ usable: false, winner: null }),
      { kind: 'reload', key: recordedKey },
    ],
    [
      'row 6: reload loaded → keep',
      facts({ usable: false, winner: null, reload: { kind: 'loaded' } }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 6: reload recognized → keep',
      facts({ usable: false, winner: null, reload: { kind: 'recognized' } }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 6: reload missing → stand-in (R3), no freeze without a different winner',
      facts({ usable: false, winner: null, reload: { kind: 'missing', evidence: durable } }),
      { kind: 'replacement' },
    ],
    [
      'row 6: reload rejected → stand-in (R3)',
      facts({ usable: false, winner: null, reload: { kind: 'rejected', evidence: durable } }),
      { kind: 'replacement' },
    ],
    [
      'row 6: reload unavailable (temporary) → stand-in (R3)',
      facts({ usable: false, winner: null, reload: { kind: 'unavailable' } }),
      { kind: 'replacement' },
    ],
    [
      'row 7: recorded unusable, nothing same-shape, different winner → reload first',
      facts({ usable: false, winner: 'different' }),
      { kind: 'reload', key: recordedKey },
    ],
    [
      'row 7: reload loaded → keep (R5a)',
      facts({ usable: false, winner: 'different', reload: { kind: 'loaded' } }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 7: reload missing → freeze (R5b) with the durable evidence',
      facts({ usable: false, winner: 'different', reload: { kind: 'missing', evidence: durable } }),
      { kind: 'freeze', verdict: { cause: 'tool-shape-lost', evidence: durable } },
    ],
    [
      'row 7: reload rejected → freeze (R5b)',
      facts({
        usable: false,
        winner: 'different',
        reload: { kind: 'rejected', evidence: durable },
      }),
      { kind: 'freeze', verdict: { cause: 'tool-shape-lost', evidence: durable } },
    ],
    [
      'row 7: reload unavailable (temporary) → stand-in, never freeze',
      facts({ usable: false, winner: 'different', reload: { kind: 'unavailable' } }),
      { kind: 'replacement' },
    ],
    [
      'row 7: reload denied (withdrawn qualification) → stand-in (R3)',
      facts({ usable: false, winner: 'different', reload: { kind: 'denied' } }),
      { kind: 'replacement' },
    ],
    [
      'row 7: reload invalid (origin check) → stand-in (R3)',
      facts({ usable: false, winner: 'different', reload: { kind: 'invalid' } }),
      { kind: 'replacement' },
    ],
    [
      'row 7: reload draining → counts as unusable → stand-in',
      facts({ usable: false, winner: 'different', reload: { kind: 'draining' } }),
      { kind: 'replacement' },
    ],
    [
      'row 7: reload conflict with a usable holder → the recorded key is usable → keep',
      facts({ usable: false, winner: 'different', reload: { kind: 'conflict', usable: true } }),
      { kind: 'keep', key: recordedKey },
    ],
    [
      'row 7: reload conflict with an unusable holder → stand-in',
      facts({ usable: false, winner: 'different', reload: { kind: 'conflict', usable: false } }),
      { kind: 'replacement' },
    ],
  ]

  it.each(rows)('%s', (_name, input, plan) => {
    expect(planAdoption(input)).toEqual(plan)
  })

  it('never freezes while a same-shape contribution exists, whatever the reload answered', () => {
    expect(
      planAdoption(
        facts({
          usable: false,
          sameShape: [fallbackKey],
          winner: 'different',
          reload: { kind: 'missing', evidence: durable },
        }),
      ),
    ).toEqual({ kind: 'fallback', key: fallbackKey })
  })
})

describe('refreshAvailability: a provider change during a Run', () => {
  const recorded = key('read_file')
  const fallback = key('read_file', { kind: 'tenant', tenant: tenantA() })

  it.each([
    [
      'recorded usable → available on the recorded key',
      { recorded: { key: recorded, usable: true }, sameShape: [fallback] },
      { kind: 'available', key: recorded },
    ],
    [
      'recorded unusable, same-shape contribution → routed, the recorded key does not move',
      { recorded: { key: recorded, usable: false }, sameShape: [fallback] },
      { kind: 'routed', key: fallback },
    ],
    [
      'recorded unusable, nothing same-shape → unavailable stand-in; no join, no advance, no freeze',
      { recorded: { key: recorded, usable: false }, sameShape: [] },
      { kind: 'unavailable' },
    ],
  ] as const)('%s', (_name, input, outcome) => {
    expect(refreshAvailability(input)).toEqual(outcome)
  })
})

describe('foldResident: the resident set only grows (R1, R4)', () => {
  const read = fn()
  const resident = { definition: read, shape: shapeOf(read), key: key('read_file') }

  it('adds a capability once and keeps the earlier items', () => {
    const files = commandsDefinition()
    const first = foldResident([], resident)
    if (!('ok' in first)) throw new Error(first.failure.kind)
    expect(first.ok).toEqual([resident])
    expect(Object.isFrozen(first.ok)).toBe(true)
    const second = foldResident(first.ok, {
      definition: files,
      shape: shapeOf(files),
      key: key('files'),
    })
    if (!('ok' in second)) throw new Error(second.failure.kind)
    expect(second.ok.map(item => item.definition.name)).toEqual(['read_file', 'files'])
    expect(first.ok).toHaveLength(1)
  })

  it('refuses a second admission of the same capability, even with another shape or key', () => {
    const start = foldResident([], resident)
    if (!('ok' in start)) throw new Error(start.failure.kind)
    const widened = { ...read, parameters: parameters(['path', 'mode']) }
    expect(
      foldResident(start.ok, {
        definition: widened,
        shape: shapeOf(widened),
        key: key('read_file', { kind: 'official' }, '2'),
      }),
    ).toEqual({ failure: { kind: 'already-resident', name: 'read_file' } })
  })

  it('refuses a recorded shape that is not the shape of the recorded definition', () => {
    const widened = { ...read, parameters: parameters(['path', 'mode']) }
    expect(foldResident([], { ...resident, shape: shapeOf(widened) })).toEqual({
      failure: { kind: 'shape-mismatch', name: 'read_file' },
    })
  })
})
