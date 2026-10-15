import { expect, it } from 'vitest'
import { createCategoryRegistry } from '@omne-harness/assets'
import { toolBodyContract } from '@omne-harness/tool'

it('accepts read_file and records skill references without making them required', () => {
  const registry = createCategoryRegistry()
  const port = toolBodyContract()
  registry.register(port)
  const body = { name: 'read_file', composes: { skills: ['review'] } }
  expect(port.judge(body, { capabilityName: 'read_file' })).toEqual({ ok: true })
  expect(port.references(body)).toEqual([{ category: 'skill', name: 'review' }])
  expect(port.deriveDeclarations(body)).toEqual({ entries: [] })
  expect(registry.lookup('tool')?.category).toBe('tool')
})

it('does not treat an object literal as a read document', () => {
  const port = toolBodyContract()
  let ran = false
  const body = {
    name: 'read_file',
    run() {
      ran = true
    },
  }
  expect(port.judge(body)).toEqual({ ok: false, rejected: 'incomplete-reference' })
  expect(ran).toBe(false)
})

it('rejects a tool body whose name is not the capability name', () => {
  const port = toolBodyContract()
  const body = { name: 'write_file', composes: { skills: ['review'] } }
  const context = { capabilityName: 'read_file' }
  expect(port.judge(body, context)).toEqual({ ok: false, rejected: 'name-mismatch' })
  expect(() => port.deriveDeclarations(body, context)).toThrow(/failed judgment/)
  expect(() => port.references(body, context)).toThrow(/failed judgment/)
})
