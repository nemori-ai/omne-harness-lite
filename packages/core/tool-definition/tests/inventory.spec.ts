import { describe, expect, it } from 'vitest'
import { judgeToolDefinition, judgeToolReturn, validate } from '../src/index.ts'

const base = {
  name: 't',
  description: 'd',
  paradigm: 'single',
  input: { type: 'object', properties: {} },
  permissions: { execute: { default: 'ask' } },
  origin: { kind: 'authored' },
}
const env = {
  category: 'placement_identity',
  default: { bindingLayer: 'host_machine', facilities: [] },
}
describe('M inventory fields and rejecting actual malformed inputs', () => {
  for (const [id, value] of [
    ['name', { ...base, name: undefined }],
    ['description', { ...base, description: undefined }],
    ['input', { ...base, input: undefined }],
  ] as const)
    it(`JSON missing preservation ${id}`, () =>
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M1' }))
  for (const [id, value] of [
    ['execute', { ...base, permissions: {} }],
    ['execute.default', { ...base, permissions: { execute: {} } }],
    ['origin.kind', { ...base, origin: {} }],
    [
      'input',
      {
        name: 't',
        description: 'd',
        paradigm: 'single',
        permissions: base.permissions,
        origin: base.origin,
      },
    ],
    ['setting.category', { ...base, settings: { timeout: { default: 'PT1M' } } }],
    ['setting.default', { ...base, settings: { timeout: { category: 'preference' } } }],
    [
      'environment.facilities',
      {
        ...base,
        settings: { targetEnvironment: { ...env, default: { bindingLayer: 'host_machine' } } },
      },
    ],
    ['mcp.endpoint', { ...base, origin: { kind: 'mcp', remoteName: 'x' } }],
    [
      'mcp.remoteName',
      { ...base, origin: { kind: 'mcp', endpoint: { category: 'mcp', name: 'ep' } } },
    ],
  ] as const)
    it(`M3 missing ${id}`, () =>
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M3' }))
  for (const [id, value] of [
    ['definition', { ...base, extra: true }],
    [
      'command',
      {
        ...base,
        paradigm: 'multi',
        input: undefined,
        commands: {
          go: { description: 'd', input: { type: 'object', properties: {} }, extra: true },
        },
      },
    ],
    ['needs', { ...base, needs: { extra: true } }],
    ['settings', { ...base, settings: { extra: true } }],
    [
      'setting',
      { ...base, settings: { timeout: { category: 'preference', default: 'PT1M', extra: true } } },
    ],
    [
      'environment',
      {
        ...base,
        settings: { targetEnvironment: { ...env, default: { ...env.default, extra: true } } },
      },
    ],
    ['permissions', { ...base, permissions: { ...base.permissions, extra: true } }],
    ['execute', { ...base, permissions: { execute: { default: 'ask', extra: true } } }],
    ['composes', { ...base, composes: { extra: true } }],
    [
      'origin',
      { ...base, origin: { kind: 'authored', endpoint: { category: 'mcp', name: 'ep' } } },
    ],
  ] as const)
    it(`M4 unknown member ${id}`, () => {
      // Preserve the intended missing member in this one multi fixture, never drop JSON keys in product code.
      const actual =
        id === 'command'
          ? {
              name: 't',
              description: 'd',
              paradigm: 'multi',
              commands: value.commands,
              permissions: base.permissions,
              origin: base.origin,
            }
          : value
      expect(judgeToolDefinition(actual)).toMatchObject({ rejected: 'malformed', malformed: 'M4' })
    })
  for (const [id, value] of [
    ['name', { ...base, name: 42 }],
    ['description', { ...base, description: null }],
    ['help', { ...base, help: 7 }],
    ['needs', { ...base, needs: [] }],
    ['settings', { ...base, settings: null }],
    ['composes', { ...base, composes: [] }],
    ['permissions', { ...base, permissions: null }],
    ['execute', { ...base, permissions: { execute: [] } }],
    ['origin', { ...base, origin: null }],
    [
      'facilities',
      {
        ...base,
        settings: { targetEnvironment: { ...env, default: { ...env.default, facilities: null } } },
      },
    ],
  ] as const)
    it(`M5 wrong type ${id}`, () =>
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M5' }))
  for (const [id, value] of [
    ['help', { ...base, help: '' }],
    ['description', { ...base, description: '' }],
    ['dependency', { ...base, needs: { externalServices: [''] } }],
    [
      'facility',
      {
        ...base,
        settings: { targetEnvironment: { ...env, default: { ...env.default, facilities: [''] } } },
      },
    ],
    ['skill', { ...base, composes: { skills: [''] } }],
    [
      'remoteName',
      {
        ...base,
        origin: { kind: 'mcp', endpoint: { category: 'mcp', name: 'ep' }, remoteName: '' },
      },
    ],
  ] as const)
    it(`M6 empty string ${id}`, () =>
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M6' }))
  for (const [id, value] of [
    ['external', { ...base, needs: { externalServices: ['s', 's'] } }],
    ['input', { ...base, needs: { inputModalities: ['image', 'image'] } }],
    ['output', { ...base, needs: { outputModalities: ['audio', 'audio'] } }],
    ['skills', { ...base, composes: { skills: ['s', 's'] } }],
  ] as const)
    it(`M7 duplicate ${id}`, () =>
      expect(judgeToolDefinition(value)).toMatchObject({ rejected: 'malformed', malformed: 'M7' }))
  for (const value of [
    null,
    5,
    'single',
    [],
    { paradigm: null },
    { paradigm: false },
    { ...base, commands: null },
    { ...base, paradigm: 'multi', commands: null },
  ])
    it(`total rejection ${JSON.stringify(value)}`, () =>
      expect(judgeToolDefinition(value)).toHaveProperty('rejected'))
  it('return M18 extra raw/offload data and M19 wrong collection shapes', () => {
    expect(
      judgeToolReturn({
        content: [],
        offload: { raw: { inline: 'eA==', mediaType: 'text/plain', extra: true } },
      }),
    ).toEqual({ rejected: 'malformed', malformed: 'M18' })
    expect(
      judgeToolReturn({
        content: [],
        offload: { raw: { inline: 'eA==', mediaType: 'text/plain' }, extra: true },
      }),
    ).toEqual({ rejected: 'malformed', malformed: 'M18' })
    for (const value of [
      { content: null },
      { content: [], offload: [] },
      { content: [], attachments: {} },
      { content: [], offload: { raw: { inline: 'eA==', mediaType: 'text/plain' }, summary: null } },
    ])
      expect(judgeToolReturn(value)).toEqual({ rejected: 'malformed', malformed: 'M19' })
  })
  for (const [value, valid] of [
    ['PT30S', true],
    ['PT1H30M', true],
    ['PT0.5S', true],
    ['PT0S', true],
    ['PT48H', true],
    ['PT', false],
    ['P1D', false],
    ['P1M', false],
    ['PT1.5H', false],
    ['PT30M1H', false],
    ['-PT5S', false],
    ['30s', false],
    [30, false],
    ['PT30S\n', false],
  ] as const)
    it(`EX6 Duration ${JSON.stringify(value)}`, () =>
      expect(validate('Duration', value).valid).toBe(valid))
  for (const value of ['host_machine', 'stateless_sandbox', 'session_sandbox', 'tenant_sandbox'])
    it(`EX6 binding ${value}`, () => expect(validate('BindingLayer', value).valid).toBe(true))
  for (const value of ['session', 'sandbox'])
    it(`EX6 binding reject ${value}`, () =>
      expect(validate('BindingLayer', value).valid).toBe(false))
  for (const value of [{ default: 'forbid' }, { default: 'auto' }, { default: 'ask' }])
    it(`EX6 permission ${value.default}`, () =>
      expect(validate('ExecutePermission', value).valid).toBe(true))
  for (const value of [{}, { default: 'auto_place' }, { default: 'ask', remember: true }])
    it(`EX6 permission rejected ${JSON.stringify(value)}`, () =>
      expect(validate('ExecutePermission', value).valid).toBe(false))
})
