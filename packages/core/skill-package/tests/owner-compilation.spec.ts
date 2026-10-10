import { expect, it } from 'vitest'
import { createSkillJudge } from '../src/judge.ts'
import { skillV2SchemaBinding, type SkillSchemaBinding } from '../src/schema.ts'

function observedBinding() {
  let compilations = 0
  const binding: SkillSchemaBinding = {
    ...skillV2SchemaBinding,
    createRuntime() {
      const runtime = skillV2SchemaBinding.createRuntime()
      return {
        ...runtime,
        compile(schema) {
          compilations++
          return runtime.compile(schema)
        },
      }
    },
  }
  return { binding, compilations: () => compilations }
}
function input(type: 'integer' | 'string', value: unknown) {
  return {
    manifest: { name: 'x', description: 'test' },
    body: '',
    resources: [],
    definition: {
      format: 1,
      settings: [
        {
          item: 'value',
          kind: 'setting',
          category: 'preference',
          domain: { kind: 'open', schema: { $id: 'urn:test:skill-setting', type } },
          default: value,
        },
      ],
    },
  }
}

it('reuses an owned schema but checks every current default and isolates changed schemas with the same id', () => {
  const observed = observedBinding()
  const judge = createSkillJudge(observed.binding, { reuseDomainValidators: true })
  expect(judge(input('integer', 1))).toEqual({ ok: true })
  expect(observed.compilations()).toBe(1)
  expect(judge(input('integer', 2))).toEqual({ ok: true })
  expect(judge(input('integer', 'bad'))).toEqual({ rejected: 'malformed', malformed: 'M12' })
  expect(observed.compilations()).toBe(1)
  expect(judge(input('string', 'valid'))).toEqual({ ok: true })
  expect(judge(input('string', 1))).toEqual({ rejected: 'malformed', malformed: 'M12' })
  expect(observed.compilations()).toBe(2)
  expect(judge(input('integer', 3))).toEqual({ ok: true })
  expect(observed.compilations()).toBe(2)
})

it('keeps standalone judges free of retained author validators', () => {
  const observed = observedBinding()
  const judge = createSkillJudge(observed.binding)
  expect(judge(input('integer', 1))).toEqual({ ok: true })
  expect(judge(input('integer', 2))).toEqual({ ok: true })
  expect(observed.compilations()).toBe(2)
})
