import { expect, it } from 'vitest'
import { createCategoryRegistry } from '@omne-harness/assets'
import { skillBodyContract } from '@omne-harness/skill'

it('reads a skill body without running a script and records required tool identities', () => {
  let ran = false
  const data = { name: 'review', tools: [{ category: 'tool', name: 'read_file' }] }
  const body = {
    ...data,
    run() {
      ran = true
    },
  }
  const port = skillBodyContract()
  const registry = createCategoryRegistry()
  registry.register(port)
  expect(port.judge(body, { capabilityName: 'review' })).toEqual({ ok: true })
  expect(ran).toBe(false)
  expect(port.references(data)).toEqual([{ category: 'tool', name: 'read_file' }])
  expect(registry.lookup('skill')?.category).toBe('skill')
})

it('rejects a skill body whose name is not the capability name', () => {
  const port = skillBodyContract()
  const body = { name: 'other', tools: [{ category: 'tool', name: 'read_file' }] }
  const context = { capabilityName: 'review' }
  expect(port.judge(body, context)).toEqual({ ok: false, rejected: 'name-mismatch' })
  expect(() => port.deriveDeclarations(body, context)).toThrow(/failed judgment/)
  expect(() => port.references(body, context)).toThrow(/failed judgment/)
})

it('rejects a skill tool reference that is not a tool identity', () => {
  const port = skillBodyContract()
  expect(port.judge({ name: 'review', tools: [{ category: 'mcp', name: 'files' }] })).toEqual({
    ok: false,
    rejected: 'incomplete-reference',
  })
})
