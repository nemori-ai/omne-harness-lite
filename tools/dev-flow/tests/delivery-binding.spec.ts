import { describe, expect, it } from 'vitest'
import {
  BINDING_MARKERS,
  parseTaskBinding,
  readTaskBinding,
  type TaskBindingV1,
  type TaskBindingV2,
} from '../src/delivery/binding.ts'

const issue = {
  repository: 'owner/repo',
  id: 'I_1',
  number: 1,
  url: 'https://github.com/owner/repo/issues/1',
}
export const v1: TaskBindingV1 = {
  schemaVersion: 1,
  issue,
  revision: 1,
  attempt: 'one',
  responsible: 'human',
  branch: 'human/task',
  route: { kind: 'track', track: 'legacy-refactor' },
  completionTarget: 'track',
  taskBase: 'a'.repeat(40),
  writeScope: ['tools/dev-flow'],
  dispatch: 'https://github.com/owner/repo/issues/1#issuecomment-1',
  conditions: [],
  authorization: [],
}
export const v2: TaskBindingV2 = {
  ...v1,
  schemaVersion: 2,
  line: 'engineering-toolchain',
  nature: 'impl',
  contractChange: 'none',
  milestone: 'M1',
}
function block(value: unknown, marker: string = BINDING_MARKERS[1]): string {
  return `- 交付修订：1\n\`\`\`json ${marker}\n${JSON.stringify(value)}\n\`\`\``
}

describe('binding versions', () => {
  it('parses version 1 to the same value and top-level key order', () => {
    const parsed = parseTaskBinding(JSON.parse(JSON.stringify(v1)))
    expect(parsed).toEqual(v1)
    expect(Object.keys(parsed)).toEqual(Object.keys(v1))
  })

  it('keeps the version 1 field set: attribute fields are unknown there', () => {
    expect(() => parseTaskBinding({ ...v1, line: 'engineering-toolchain' })).toThrow(
      'binding: unknown fields line',
    )
  })

  it('parses version 2 with the four attribute fields', () => {
    expect(parseTaskBinding(v2)).toEqual(v2)
    expect(parseTaskBinding({ ...v2, milestone: null })).toMatchObject({ milestone: null })
  })

  it.each(['line', 'nature', 'contractChange', 'milestone'] as const)(
    'refuses a version 2 binding without %s',
    field => {
      const { [field]: _, ...rest } = v2
      expect(() => parseTaskBinding(rest)).toThrow(field)
    },
  )

  it.each([
    ['line', 'Engineering Toolchain'],
    ['line', ''],
    ['nature', 'feature'],
    ['contractChange', 'minor'],
    ['milestone', ''],
    ['milestone', 1],
  ])('refuses version 2 %s value %j', (field, value) => {
    expect(() => parseTaskBinding({ ...v2, [field]: value })).toThrow(field)
  })

  it('refuses unknown fields and unsupported versions', () => {
    expect(() => parseTaskBinding({ ...v2, extra: true })).toThrow('unknown fields extra')
    expect(() => parseTaskBinding({ ...v1, schemaVersion: 3 })).toThrow('schemaVersion must be 1')
  })
})

describe('binding blocks in the Issue body', () => {
  it('reads the version 1 block unchanged and the version 2 block', () => {
    expect(readTaskBinding(block(v1), issue)).toEqual(v1)
    expect(readTaskBinding(block(v2, BINDING_MARKERS[2]), issue)).toEqual(v2)
  })

  it('refuses a block whose marker and schemaVersion differ', () => {
    expect(() => readTaskBinding(block(v2), issue)).toThrow('must carry schemaVersion 1')
    expect(() => readTaskBinding(block(v1, BINDING_MARKERS[2]), issue)).toThrow(
      'must carry schemaVersion 2',
    )
  })

  it('refuses a body with a version 1 and a version 2 block', () => {
    const body = `${block(v1)}\n\`\`\`json ${BINDING_MARKERS[2]}\n${JSON.stringify(v2)}\n\`\`\``
    expect(() => readTaskBinding(body, issue)).toThrow('Duplicate omne-integration-binding')
  })
})
