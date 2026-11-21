import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { describe, expect, it } from 'vitest'
import { organizationCodec, workspaceEquals } from '@omne-harness/legal-identity'
import {
  type FixedToolRequest,
  type ToolDefinition,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  judgeFixedToolRequest,
  judgeToolInvokeRequest,
  toolInvokeRequestOf,
} from '@omne-harness/tool-contract/provider'
import { testingWorkspace } from '@omne-harness/tool-contract/testing'
import { adoption, commandsDefinition, evidence, functionDefinition } from './tool-values.ts'

const WORKSPACE_TEXT = 'wsp_c0nf0rmance000000000000000'

function request(): FixedToolRequest {
  return {
    availability: {
      kind: 'available',
      definition: functionDefinition(),
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
    invocation: { kind: 'direct', source: evidence('source') },
    command: null,
    arguments: { original: '{"path":"a"}', effective: '{"path":"a"}', complete: true },
    label: { intent: null, tool: functionDefinition().name, command: null, preview: '' },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    requesterScope: fixtureScope(),
    resources: [],
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant') },
    consumer: { owner: 'consumer', work: 'work-1', position: 'position-1', purpose: 'tool-result' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, scopeBudget: null, foregroundMs: 0, backgroundAfterMs: null },
  }
}

function rejection(value: unknown) {
  const judged = judgeFixedToolRequest(value)
  if ('ok' in judged) throw new Error('the request was accepted')
  return judged.failure
}

function invokeRequest(): ToolInvokeRequest {
  return toolInvokeRequestOf(request())
}

describe('ordinary invoke request judgment', () => {
  it('copies and freezes nested payload data without freezing or sharing the caller data', () => {
    const value = { ...invokeRequest(), resources: [adoption('resource')] }
    const expected = structuredClone(value)
    const judged = judgeToolInvokeRequest(value)
    expect(judged).toEqual({ ok: expected })
    if ('failure' in judged) throw new Error('legal invoke payload was rejected')
    for (const [copy, original] of [
      [judged.ok, value],
      [judged.ok.availability.definition, value.availability.definition],
      [judged.ok.arguments, value.arguments],
      [judged.ok.resources, value.resources],
      [judged.ok.resources[0], value.resources[0]],
      [judged.ok.scope.grant, value.scope.grant],
    ]) {
      expect(copy).not.toBe(original)
      expect(Object.isFrozen(copy)).toBe(true)
      expect(Object.isFrozen(original)).toBe(false)
    }
    Object.assign(value.arguments, { effective: '{}' })
    Object.assign(value.availability.definition, { name: 'changed' })
    value.resources.push(adoption('later'))
    expect(judged.ok).toEqual(expected)
  })

  const commands = toolInvokeRequestOf({
    ...request(),
    availability: {
      kind: 'available',
      definition: commandsDefinition(),
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
  })
  it.each([
    { name: 'null', input: null, field: 'ToolInvokeRequest', reason: 'type' },
    { name: 'primitive', input: 1, field: 'ToolInvokeRequest', reason: 'type' },
    { name: 'missing fields', input: {}, field: 'command', reason: 'missing' },
    {
      name: 'caller source',
      input: { ...invokeRequest(), source: evidence('source') },
      field: 'source',
      reason: 'unknown-field',
    },
    {
      name: 'a copy of the environment declaration',
      input: { ...invokeRequest(), environment: null },
      field: 'environment',
      reason: 'unknown-field',
    },
    {
      name: 'the definition by value',
      input: { ...invokeRequest(), availability: request().availability },
      field: 'availability.definition.owner',
      reason: 'missing',
    },
    {
      name: 'a reference without the tool name',
      input: {
        ...invokeRequest(),
        availability: { ...invokeRequest().availability, name: ' ' },
      },
      field: 'availability.name',
      reason: 'blank',
    },
  ])('rejects $name with a structured field and reason', ({ input, field, reason }) => {
    expect(judgeToolInvokeRequest(input)).toEqual({ failure: { field, reason } })
  })

  it('accepts a declared command through the ordinary invoke entry', () => {
    const value = {
      ...commands,
      command: 'read',
      label: { intent: null, tool: 'files', command: 'read', preview: '' },
    }
    expect(judgeToolInvokeRequest(value)).toEqual({ ok: value })
  })

  it('names the definition only by its adoption and the tool name', () => {
    const fixed = request()
    expect(invokeRequest().availability).toEqual({
      kind: 'available',
      definition: fixed.availability.definition.adoption,
      name: fixed.availability.definition.name,
      executor: adoption('exec'),
      layer: { kind: 'official' },
    })
  })
})

describe('the label of a request (TL-50, TL-51)', () => {
  const shellTool = (): ToolDefinition => {
    const source = commandsDefinition()
    if (source.kind !== 'commands') throw new Error('commands')
    return {
      ...source,
      backgroundAllowed: true,
      commands: source.commands.map(command =>
        command.name === 'shell' ? { ...command, background: { unless: [] } } : command,
      ),
    }
  }
  const shell = (intent: string | null): FixedToolRequest => ({
    ...request(),
    availability: { ...request().availability, definition: shellTool() } as never,
    command: 'shell',
    label: { intent, tool: 'files', command: 'shell', preview: 'sleep 60' },
  })

  it('a command that may go to the background is refused without an intent', () => {
    expect(rejection(shell(null))).toEqual({ field: 'label.intent', reason: 'required' })
    expect(judgeFixedToolRequest(shell('wait a minute'))).toEqual({ ok: shell('wait a minute') })
  })

  it('a command without background permission is admitted without an intent', () => {
    const read = {
      ...shell(null),
      command: 'read',
      label: { intent: null, tool: 'files', command: 'read', preview: '' },
    }
    expect(judgeFixedToolRequest(read)).toEqual({ ok: read })
  })

  it('an intent in the label is one line within the bound', () => {
    expect(rejection(shell('a\nb'))).toEqual({ field: 'label.intent', reason: 'multiline' })
    const exact = { ...shell('x'), label: { ...shell('x').label, preview: 'p'.repeat(120) } }
    expect(judgeFixedToolRequest(exact)).toEqual({ ok: exact })
    expect(
      rejection({ ...shell('x'), label: { ...shell('x').label, preview: 'p'.repeat(121) } }),
    ).toEqual({
      field: 'label.preview',
      reason: 'too-long',
    })
  })

  it('the intent decides nothing: the same request without it differs only in its label', () => {
    const read = (intent: string | null): FixedToolRequest => ({
      ...request(),
      label: { ...request().label, intent },
    })
    const judged = [judgeFixedToolRequest(read(null)), judgeFixedToolRequest(read('look'))]
    expect(judged.map(value => 'ok' in value)).toEqual([true, true])
  })
})

describe('request judgment', () => {
  it('request judgment: accepts a legal direct request and gives a frozen copy', () => {
    const value = request()
    const judged = judgeFixedToolRequest(value)
    expect(judged).toEqual({ ok: value })
    if ('ok' in judged) expect(Object.isFrozen(judged.ok)).toBe(true)
  })

  it('request judgment: accepts a known-unavailable target with a command of a command tool', () => {
    const value: FixedToolRequest = {
      ...request(),
      availability: {
        kind: 'known-unavailable',
        definition: commandsDefinition(),
        reason: 'dependency-unavailable:file-system',
      },
      command: 'read',
      label: { intent: null, tool: 'files', command: 'read', preview: '' },
    }
    expect(judgeFixedToolRequest(value)).toEqual({ ok: value })
  })

  it('request judgment: a command on a function tool is rejected', () => {
    expect(rejection({ ...request(), command: 'read' })).toEqual({
      field: 'command',
      reason: 'not-a-command-tool',
    })
  })

  it('request judgment: a command tool without a command, or with an undeclared one, is rejected', () => {
    const commands = {
      ...request(),
      availability: {
        kind: 'available',
        definition: commandsDefinition(),
        executor: adoption('e'),
        layer: { kind: 'official' },
      },
    }
    expect(rejection({ ...commands, command: null })).toEqual({
      field: 'command',
      reason: 'missing',
    })
    expect(rejection({ ...commands, command: 'write' })).toEqual({
      field: 'command',
      reason: 'unknown-command',
    })
  })

  it('request judgment: a limit outside its range is rejected with its field', () => {
    const limits = request().limits
    expect(rejection({ ...request(), limits: { ...limits, concurrency: 0 } })).toEqual({
      field: 'limits.concurrency',
      reason: 'range',
    })
    expect(rejection({ ...request(), limits: { ...limits, foregroundMs: -1 } })).toEqual({
      field: 'limits.foregroundMs',
      reason: 'range',
    })
    expect(rejection({ ...request(), limits: { ...limits, backgroundAfterMs: 1.5 } })).toEqual({
      field: 'limits.backgroundAfterMs',
      reason: 'range',
    })
  })

  it('request judgment: the scope budget is a positive integer or null, under the same rule as the tool limit', () => {
    const limits = request().limits
    for (const scopeBudget of [null, 1, 3])
      expect(judgeFixedToolRequest({ ...request(), limits: { ...limits, scopeBudget } })).toEqual({
        ok: { ...request(), limits: { ...limits, scopeBudget } },
      })
    for (const scopeBudget of [0, -1, 1.5])
      expect(rejection({ ...request(), limits: { ...limits, scopeBudget } })).toEqual({
        field: 'limits.scopeBudget',
        reason: 'range',
      })
    expect(rejection({ ...request(), limits: { ...limits, scopeBudget: '1' } })).toEqual({
      field: 'limits.scopeBudget',
      reason: 'type',
    })
    const { scopeBudget: _absent, ...withoutBudget } = limits
    expect(rejection({ ...request(), limits: withoutBudget })).toEqual({
      field: 'limits.scopeBudget',
      reason: 'missing',
    })
  })

  it('request judgment: an unknown field, a non-boolean complete and an illegal definition are rejected', () => {
    expect(rejection({ ...request(), extra: 1 })).toEqual({
      field: 'extra',
      reason: 'unknown-field',
    })
    const args = { ...request().arguments, complete: 'true' }
    expect(rejection({ ...request(), arguments: args })).toEqual({
      field: 'arguments.complete',
      reason: 'type',
    })
    const definition = { ...functionDefinition(), description: '   ' }
    const availability = {
      kind: 'available',
      definition,
      executor: adoption('e'),
      layer: { kind: 'official' },
    }
    expect(rejection({ ...request(), availability })).toEqual({
      field: 'availability.definition.description',
      reason: 'blank',
    })
  })

  it('request judgment: an available result names its source layer, and the layer is a closed shape', () => {
    const { availability } = request()
    if (availability.kind !== 'available') throw new Error('available')
    const { layer: _layer, ...withoutLayer } = availability
    expect(rejection({ ...request(), availability: withoutLayer })).toEqual({
      field: 'availability.layer',
      reason: 'missing',
    })
    expect(
      rejection({ ...request(), availability: { ...availability, layer: { kind: 'session' } } }),
    ).toEqual({ field: 'availability.layer.kind', reason: 'value' })
    const tenant = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_a' },
      account: { name: 'AccountId', text: 'acc_a' },
    }
    const layered = {
      ...request(),
      availability: { ...availability, layer: { kind: 'tenant', tenant } },
    }
    const judged = judgeFixedToolRequest(layered)
    if (!('ok' in judged)) throw new Error(judged.failure.field)
    expect(judged.ok.availability).toMatchObject({ layer: { kind: 'tenant', tenant } })
    expect(
      rejection({
        ...request(),
        availability: {
          ...availability,
          layer: { kind: 'tenant', tenant: { ...tenant, extra: 1 } },
        },
      }),
    ).toEqual({ field: 'availability.layer.tenant.extra', reason: 'unknown-field' })
    expect(
      rejection({
        ...request(),
        availability: { ...availability, layer: { kind: 'workspace', workspace: '' } },
      }),
    ).toEqual({ field: 'availability.layer.workspace', reason: 'type' })
  })

  it('request judgment: a workspace is a legal-identity WorkspaceId or null, nothing else', () => {
    const workspace = testingWorkspace(WORKSPACE_TEXT)
    const layer = (value: unknown) => ({
      ...request().availability,
      layer: { kind: 'workspace', workspace: value },
    })
    for (const accepted of [{ ...request(), workspace }, request()]) {
      expect('ok' in judgeFixedToolRequest(accepted)).toBe(true)
      expect('ok' in judgeToolInvokeRequest(toolInvokeRequestOf(accepted))).toBe(true)
    }
    const judged = judgeFixedToolRequest({
      ...request(),
      availability: layer({ name: 'WorkspaceId', text: WORKSPACE_TEXT }),
    })
    if ('failure' in judged) throw new Error('a layer built from legal workspace data was rejected')
    const rebuilt = judged.ok.availability
    if (rebuilt.kind !== 'available' || rebuilt.layer.kind !== 'workspace')
      throw new Error('the layer changed shape')
    expect(workspaceEquals(rebuilt.layer.workspace, workspace)).toBe(true)

    const wrongFamily = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
    if (!wrongFamily.ok) throw new Error('the organization text is not legal')
    const bad: [string, unknown, { field: string; reason: string }][] = [
      ['a string', WORKSPACE_TEXT, { field: 'workspace', reason: 'type' }],
      [
        'an object of another family',
        wrongFamily.value,
        { field: 'workspace.name', reason: 'value' },
      ],
      [
        'text that is no workspace text',
        { name: 'WorkspaceId', text: 'wsp_nope' },
        { field: 'workspace.text', reason: 'malformed' },
      ],
      [
        'another family text under the workspace name',
        { name: 'WorkspaceId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
        { field: 'workspace.text', reason: 'malformed' },
      ],
      ['an Adoption shape', adoption('workspace'), { field: 'workspace.name', reason: 'value' }],
    ]
    for (const [label, value, expected] of bad) {
      expect(rejection({ ...request(), workspace: value }), label).toEqual(expected)
      const invoke = judgeToolInvokeRequest({ ...invokeRequest(), workspace: value })
      if ('ok' in invoke) throw new Error(`${label} was accepted`)
      expect(invoke.failure, label).toEqual(expected)
    }
    expect(rejection({ ...request(), availability: layer(wrongFamily.value) })).toEqual({
      field: 'availability.layer.workspace.name',
      reason: 'value',
    })
  })

  it('request judgment: the pinned directory is a path with the workspace instance it belongs to, or is left out', () => {
    const workspace = testingWorkspace(WORKSPACE_TEXT)
    const plain = { path: '/srv/default', workspace: null }
    const attached = { path: '/srv/blog', workspace: { id: workspace, instance: 'wsi_blog' } }
    for (const directory of [plain, attached]) {
      const fixed = judgeFixedToolRequest({ ...request(), directory })
      if ('failure' in fixed) throw new Error(JSON.stringify(fixed.failure))
      expect(fixed.ok.directory).toEqual(directory)
      expect(Object.isFrozen(fixed.ok.directory)).toBe(true)
      const invoke = judgeToolInvokeRequest({ ...invokeRequest(), directory })
      if ('failure' in invoke) throw new Error(JSON.stringify(invoke.failure))
      expect(invoke.ok.directory).toEqual(directory)
    }
    const rebuilt = judgeFixedToolRequest({
      ...request(),
      directory: {
        ...attached,
        workspace: { id: { name: 'WorkspaceId', text: WORKSPACE_TEXT }, instance: 'wsi_blog' },
      },
    })
    if ('failure' in rebuilt) throw new Error('a directory rebuilt from stored data was rejected')
    const pinned = rebuilt.ok.directory?.workspace
    expect(pinned !== null && pinned !== undefined && workspaceEquals(pinned.id, workspace)).toBe(
      true,
    )
    // A request that names no directory has none; it is not null.
    const without = judgeFixedToolRequest(request())
    expect('ok' in without && 'directory' in without.ok).toBe(false)

    const bad: [string, unknown, { field: string; reason: string }][] = [
      ['null', null, { field: 'directory', reason: 'type' }],
      ['a bare path', '/srv/blog', { field: 'directory', reason: 'type' }],
      ['an empty path', { ...plain, path: '' }, { field: 'directory.path', reason: 'empty' }],
      [
        'no workspace member',
        { path: '/srv/blog' },
        { field: 'directory.workspace', reason: 'missing' },
      ],
      [
        'a workspace without its instance',
        { path: '/srv/blog', workspace: { id: workspace } },
        { field: 'directory.workspace.instance', reason: 'missing' },
      ],
      [
        'an instance without its workspace',
        { path: '/srv/blog', workspace: { id: WORKSPACE_TEXT, instance: 'wsi_blog' } },
        { field: 'directory.workspace.id', reason: 'type' },
      ],
      [
        'an unknown member',
        { ...plain, root: '/srv' },
        { field: 'directory.root', reason: 'unknown-field' },
      ],
    ]
    for (const [label, directory, expected] of bad) {
      expect(rejection({ ...request(), directory }), label).toEqual(expected)
      const invoke = judgeToolInvokeRequest({ ...invokeRequest(), directory })
      if ('ok' in invoke) throw new Error(`${label} was accepted`)
      expect(invoke.failure, label).toEqual(expected)
    }
  })

  it('request judgment: a scope is an owner, a key and the evidence of the grant', () => {
    const { scope } = request()
    expect(rejection({ ...request(), scope: { owner: scope.owner, key: scope.key } })).toEqual({
      field: 'scope.grant',
      reason: 'missing',
    })
    expect(rejection({ ...request(), scope: { ...scope, grant: 'granted' } })).toEqual({
      field: 'scope.grant',
      reason: 'type',
    })
    expect(rejection({ ...request(), scope: { ...scope, key: '' } })).toEqual({
      field: 'scope.key',
      reason: 'empty',
    })
    expect(rejection({ ...request(), scope: { ...scope, kind: 'scope-kind' } })).toEqual({
      field: 'scope.kind',
      reason: 'unknown-field',
    })
  })

  it('request judgment: a value that is not an object is rejected as the request itself', () => {
    expect(rejection(null)).toEqual({ field: 'FixedToolRequest', reason: 'type' })
  })
})

function fixtureScope() {
  const scope = decodeScopeRef({ ref: 'test-requester-scope' })
  if ('failure' in scope) throw new Error('invalid fixture scope')
  return scope.ok
}

describe('environment declarations and explicit requester scope', () => {
  const environment = {
    adoption: adoption('environment-schema'),
    value: { kind: 'string' as const, value: 'declared requirement' },
  }
  const declared = () => {
    const value = request()
    return {
      ...value,
      availability: {
        ...value.availability,
        definition: {
          ...value.availability.definition,
          declarations: { ...value.availability.definition.declarations, environment },
        },
      },
    }
  }

  it('keeps the declaration in the definition and the scope apart from workspace and concurrency scope', () => {
    const value = declared()
    const judged = judgeFixedToolRequest(value)
    expect(judged).toEqual({ ok: value })
    if ('failure' in judged) throw new Error('valid declaration rejected')
    expect(judged.ok.availability.definition.declarations.environment).toEqual(environment)
    expect(judged.ok.availability.definition.declarations.environment).not.toBe(environment)
    expect(judged.ok.requesterScope).not.toBe(value.requesterScope)
    expect(Object.isFrozen(judged.ok.requesterScope)).toBe(true)
  })

  it('rejects a copy of the declaration beside the definition and a bare adoption inside it', () => {
    expect(rejection({ ...declared(), environment })).toEqual({
      field: 'environment',
      reason: 'unknown-field',
    })
    const bare = declared()
    expect(
      rejection({
        ...bare,
        availability: {
          ...bare.availability,
          definition: {
            ...bare.availability.definition,
            declarations: {
              ...bare.availability.definition.declarations,
              environment: adoption('bare'),
            },
          },
        },
      }).field,
    ).toBe('availability.definition.declarations.environment.adoption')
  })

  it('requires a valid explicit scope and never calls scope getters', () => {
    const missing = { ...request() }
    Reflect.deleteProperty(missing, 'requesterScope')
    expect(rejection(missing)).toEqual({ field: 'requesterScope', reason: 'missing' })
    for (const requesterScope of [
      null,
      { ref: '' },
      { ref: 'scope', tenant: 'not-a-binding' },
      { ref: 'scope', parent: { ref: '' } },
    ])
      expect(rejection({ ...request(), requesterScope }).field).toMatch(/^requesterScope/)
    let reads = 0
    const requesterScope = {
      get ref() {
        reads += 1
        return 'scope'
      },
    }
    expect(rejection({ ...request(), requesterScope })).toEqual({
      field: 'requesterScope.ref',
      reason: 'accessor',
    })
    expect(reads).toBe(0)
  })
})

it.each(['self', 'ancestor'] as const)(
  'rejects a %s cycle in the requester scope before decoding',
  kind => {
    const parent = { ref: 'parent' }
    const child = { ref: 'child', parent }
    Reflect.set(parent, 'parent', kind === 'self' ? parent : child)
    const judged = judgeFixedToolRequest({ ...request(), requesterScope: child })
    expect(judged).toHaveProperty('failure.reason', 'cycle')
  },
)
