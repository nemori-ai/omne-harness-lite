import { expect, it } from 'vitest'
import {
  createCategoryRegistry,
  readBodyText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/assets'
import { skillBodyContract } from '@omne-harness/skill'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

function document(text: string): JsonValue {
  const read = readBodyText(text, limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

it('reads a skill body without running a script and records required tool identities', () => {
  const body = document('{"name":"review","tools":[{"category":"tool","name":"read_file"}]}')
  const port = skillBodyContract()
  const registry = createCategoryRegistry()
  registry.register(port)
  expect(port.judge(body, { capabilityName: 'review' })).toEqual({ ok: true })
  expect(port.references(body)).toEqual([{ category: 'tool', name: 'read_file' }])
  expect(registry.lookup('skill')?.category).toBe('skill')
})

it('does not call a function on an object that was not read as text', () => {
  const port = skillBodyContract()
  let ran = false
  const body = {
    name: 'review',
    tools: [{ category: 'tool', name: 'read_file' }],
    run() {
      ran = true
    },
  }
  expect(port.judge(body)).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(ran).toBe(false)
})

it('rejects a forged skill document without calling its functions', () => {
  const port = skillBodyContract()
  expect(
    port.judge({ kind: 'object', entries: [{ key: 'name', value: { kind: 'string', value: 7 } }] }),
  ).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  expect(port.judge({ kind: 'object', entries: [null] })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  const entries = [{ key: 'name', value: { kind: 'string', value: 'review' } }]
  let calls = 0
  type Row = (typeof entries)[number]
  entries.find = function (
    predicate: (value: Row, index: number, list: Row[]) => boolean,
  ): Row | undefined {
    calls += 1
    return Array.prototype.find.call(this, predicate)
  }
  expect(port.judge({ kind: 'object', entries })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
  expect(calls).toBe(0)
})

it('rejects a skill body whose name is not the capability name', () => {
  const port = skillBodyContract()
  const body = document('{"name":"other","tools":[{"category":"tool","name":"read_file"}]}')
  const context = { capabilityName: 'review' }
  expect(port.judge(body, context)).toEqual({ ok: false, rejected: 'name-mismatch' })
  expect(() => port.deriveDeclarations(body, context)).toThrow(/failed judgment: name-mismatch/)
  expect(() => port.references(body, context)).toThrow(/failed judgment: name-mismatch/)
})

it('rejects a skill tool reference that is not a tool identity', () => {
  const port = skillBodyContract()
  expect(
    port.judge(document('{"name":"review","tools":[{"category":"mcp","name":"files"}]}')),
  ).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
})
