// The assembly's `SessionContextDefinitions`: what JSON cannot hold, given back from one exact
// adopted definition. A table built once answers a reference with the very object it was built
// from (AD-12 compares by identity, `context-input.ts` `!==`), and answers `undefined` for a
// definition, need or key it does not hold. The definitions the release adopted declare no Context
// block, so the adopted table answers every query `undefined`: that is the truthful answer, not a
// stand-in.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  ContextBlockKey,
  NeedBinding,
  StatefulBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import type { Adoption } from '@omne-harness/session-contract'
import { adoption } from '@omne-harness/session-contract/testing'
import {
  adoptedContextDefinitions,
  createContextDefinitions,
} from '../../src/assembly/context-definitions.ts'
import { agentAdoptionsConfig } from '../../src/rows/agent-adoptions/config.ts'

const numberShape = {
  '~standard': {
    version: 1 as const,
    vendor: 'context-definitions-spec',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}

const NOTES: ContextBlockKey = 'test.notes'
const DRAFT: ContextBlockKey = 'test.draft'

function stateful(
  key: ContextBlockKey,
): StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> {
  return {
    kind: 'stateful',
    key,
    schema: numberShape,
    required: false,
    consumers: ['model'],
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    writers: ['tool'],
    singleWriterPerStep: true,
    persistence: 'checkpointed',
    reduce: (previous, update) => Number(previous ?? 0) + Number(update),
  }
}

function need(name: string, key: ContextBlockKey): NeedBinding {
  return {
    key,
    need: { name, shape: numberShape, consumer: 'model', purpose: 'test', necessity: 'optional' },
  }
}

const definition: Adoption = adoption('definition-a')
const other: Adoption = adoption('definition-b')
const notesModel = need('notes', NOTES)
const notesTool = need('tool:notes', NOTES)
const draftModel = need('draft', DRAFT)
const notesDeclaration = stateful(NOTES)

function table() {
  return createContextDefinitions([
    {
      definition,
      bindings: [notesModel, notesTool, draftModel],
      declarations: [notesDeclaration],
    },
  ])
}

describe('createContextDefinitions: one table over the declared blocks', () => {
  it('gives back the binding of a need and key as the same object on every query', () => {
    const definitions = table()
    const ref = { definition, need: 'tool:notes', key: NOTES }
    const first = definitions.binding(ref)
    expect(first).toBe(notesTool)
    expect(definitions.binding({ ...ref })).toBe(first)
    expect(definitions.binding({ definition, need: 'draft', key: DRAFT })).toBe(draftModel)
  })

  it('gives back the declaration of a key as the same object on every query', () => {
    const definitions = table()
    const first = definitions.declaration({ definition, key: NOTES })
    expect(first).toBe(notesDeclaration)
    expect(definitions.declaration({ definition, key: NOTES })).toBe(first)
  })

  it('answers undefined for a need bound to another key, an unknown need and an undeclared key', () => {
    const definitions = table()
    expect(definitions.binding({ definition, need: 'notes', key: DRAFT })).toBeUndefined()
    expect(definitions.binding({ definition, need: 'absent', key: NOTES })).toBeUndefined()
    expect(definitions.declaration({ definition, key: DRAFT })).toBeUndefined()
  })

  it('answers undefined for an adoption that differs in any field, including the digest', () => {
    const definitions = table()
    expect(definitions.binding({ definition: other, need: 'notes', key: NOTES })).toBeUndefined()
    expect(definitions.declaration({ definition: other, key: NOTES })).toBeUndefined()
    const sameButDigest = { ...definition, digest: 'sha256:another' }
    expect(
      definitions.binding({ definition: sameButDigest, need: 'notes', key: NOTES }),
    ).toBeUndefined()
    expect(definitions.declaration({ definition: sameButDigest, key: NOTES })).toBeUndefined()
  })

  it('refuses a table that binds one need and key twice, declares one key twice, or lists one definition twice', () => {
    expect(() =>
      createContextDefinitions([
        { definition, bindings: [notesModel, need('notes', NOTES)], declarations: [] },
      ]),
    ).toThrow(/notes/)
    expect(() =>
      createContextDefinitions([
        { definition, bindings: [], declarations: [notesDeclaration, stateful(NOTES)] },
      ]),
    ).toThrow(/test\.notes/)
    expect(() =>
      createContextDefinitions([
        { definition, bindings: [], declarations: [] },
        { definition, bindings: [], declarations: [] },
      ]),
    ).toThrow(/definition-a/)
  })
})

describe('adoptedContextDefinitions: the definitions the release adopted', () => {
  type Distribution = Readonly<{
    rows: readonly Readonly<{ id: string; config: unknown }>[]
  }>
  const distribution = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../config/serve.distribution.json'), 'utf8'),
  ) as Distribution
  const row = distribution.rows.find(item => item.id === 'agent-adoptions')
  if (row === undefined) throw new Error('the release has no agent-adoptions row')
  // The strict schema of the row holds every field a mapping entry may carry. Parsing the release
  // with it proves that no entry carries a field that could declare a Context block.
  const mappings = agentAdoptionsConfig.parse(row.config).mappings

  it('the release adopts at least one definition, and none of them declares a Context block', () => {
    expect(mappings.length).toBeGreaterThan(0)
    for (const entry of mappings) {
      expect(entry.definition).toEqual({
        category: 'AgentDefinition',
        name: entry.name,
        references: [],
        attributes: [],
      })
    }
  })

  it('answers undefined for every adopted definition: there is no block to restore', () => {
    for (const entry of mappings) {
      const ref = { definition: entry.candidate, key: 'session.modes' as ContextBlockKey }
      expect(adoptedContextDefinitions.binding({ ...ref, need: 'modes' })).toBeUndefined()
      expect(adoptedContextDefinitions.declaration(ref)).toBeUndefined()
    }
  })
})
