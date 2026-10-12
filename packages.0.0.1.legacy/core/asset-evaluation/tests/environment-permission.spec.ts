// @module-tag slow
// Actual tool Schema validation and complete five-layer evaluation are exercised here.
import { expect, test } from 'vitest'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import { evaluate, type EvaluationOptions } from '../src/index.ts'
import { assignment, definition, holding, shell, simple } from './fixtures.ts'

const tool: ToolDefinition = {
  name: 'shell',
  description: 'Run a command',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {}, description: 'Command input' },
  permissions: { execute: { default: 'auto' } },
  settings: {
    targetEnvironment: {
      category: 'placement_identity',
      default: {
        bindingLayer: 'host_machine',
        facilities: ['command'],
      },
    },
  },
}
function input() {
  const base = simple()
  const captured = copyJsonValue(tool)
  if ('failed' in captured) throw new Error('tool fixture is not JSON data')
  return {
    ...base,
    definitions: base.definitions.map(value =>
      value.id === 'ast_value'
        ? definition('ast_value', shell, { category: 'tool', definition: captured.ok })
        : value,
    ),
  }
}

test.each(['always-allow', 'auto_place', 'never-allow'] as const)(
  'the explicit factory option supplies %s without changing the target requirement',
  permission => {
    const result = evaluate(input(), { toolEnvironmentPermission: permission })
    if (!('ok' in result)) throw new Error('legal environment tool was rejected')
    expect(result.ok.values.find(value => value.item === 'executionEnvironment')?.value).toEqual({
      allowed: [permission],
    })
    expect(result.ok.values.find(value => value.item === 'targetEnvironment')?.value).toEqual({
      bindingLayer: 'host_machine',
      facilities: ['command'],
    })
  },
)

test('omitting options does not synthesize an executionEnvironment permission', () => {
  const result = evaluate(input())
  if (!('ok' in result)) throw new Error('existing tool evaluation failed')
  expect(result.ok.values.some(value => value.item === 'executionEnvironment')).toBe(false)
})

test('an organization bound cannot be widened by tenant or session picks', () => {
  const base = input()
  const result = evaluate(
    {
      ...base,
      holdings: [
        ...base.holdings,
        {
          ...holding('organization', shell, 'ast_value', [
            assignment('executionEnvironment', { allowed: ['never-allow'] }, true),
          ]),
          basis: { kind: 'official' },
        },
        {
          ...holding('tenant', shell, 'ast_value', [
            assignment('executionEnvironment', { allowed: ['always-allow'] }),
          ]),
          basis: { kind: 'official' },
        },
      ],
      session: [
        {
          capability: shell,
          assignment: assignment('executionEnvironment', { allowed: ['auto_place'] }),
        },
      ],
    },
    { toolEnvironmentPermission: 'always-allow' },
  )
  if (!('ok' in result)) throw new Error('legal permission layers rejected')
  expect(result.ok.values.find(value => value.item === 'executionEnvironment')).toMatchObject({
    value: { allowed: ['never-allow'] },
    from: 'organization',
    lockedAt: 'organization',
  })
})

test('a session pick resolves the current permission and current target setting', () => {
  const base = input()
  const target = { bindingLayer: 'session_sandbox', facilities: ['command', 'files'] }
  const result = evaluate(
    {
      ...base,
      session: [
        {
          capability: shell,
          assignment: assignment('executionEnvironment', { allowed: ['auto_place'] }),
        },
        { capability: shell, assignment: assignment('targetEnvironment', target) },
      ],
    },
    { toolEnvironmentPermission: 'always-allow' },
  )
  if (!('ok' in result)) throw new Error('legal session evaluation rejected')
  expect(result.ok.values.find(value => value.item === 'executionEnvironment')).toMatchObject({
    value: { allowed: ['auto_place'] },
    from: 'session',
  })
  expect(result.ok.values.find(value => value.item === 'targetEnvironment')).toMatchObject({
    value: target,
    from: 'session',
  })
})

test('an unresolved permission set stays unresolved instead of picking its first member', () => {
  const base = input()
  const result = evaluate(
    {
      ...base,
      session: [
        {
          capability: shell,
          assignment: assignment('executionEnvironment', {
            allowed: ['auto_place', 'never-allow'],
          }),
        },
      ],
    },
    { toolEnvironmentPermission: 'always-allow' },
  )
  if (!('ok' in result)) throw new Error('legal enum set rejected')
  expect(result.ok.values.find(value => value.item === 'executionEnvironment')?.value).toEqual({
    allowed: ['auto_place', 'never-allow'],
  })
})

test.each([
  null,
  {},
  { toolEnvironmentPermission: 'auto' },
  { toolEnvironmentPermission: 'always-allow', extra: true },
])('malformed explicit options reject evaluation (%j)', supplied => {
  // Exercise the runtime boundary with external malformed data, not a legal typed option.
  expect(evaluate(input(), supplied as EvaluationOptions)).toEqual({
    invalidInput: { diagnostics: [{ condition: 'C1', message: 'invalid EvaluationOptions' }] },
  })
})

test('a legal pure tool stays applicable without inventing an environment permission', () => {
  const base = input()
  const { settings: _settings, ...pure } = tool
  const captured = copyJsonValue(pure)
  if ('failed' in captured) throw new Error('fixture must be ordinary data')
  const result = evaluate(
    {
      ...base,
      definitions: base.definitions.map(value =>
        value.id === 'ast_value'
          ? definition('ast_value', shell, { category: 'tool', definition: captured.ok })
          : value,
      ),
    },
    { toolEnvironmentPermission: 'always-allow' },
  )
  if (!('ok' in result)) throw new Error('legal pure tool rejected')
  expect(result.ok.assets.some(value => value.asset === 'ast_value')).toBe(true)
  expect(result.ok.values.some(value => value.item === 'executionEnvironment')).toBe(false)
})
