import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { describe, expect, it } from 'vitest'
import { organizationCodec, workspaceEquals } from '@omne-harness/legal-identity'
import { type FixedToolRequest, type ToolInvokeRequest } from '@omne-harness/tool-contract'
import { judgeFixedToolRequest, judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
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
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: null,
    requesterScope: fixtureScope(),
    resources: [],
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant') },
    consumer: { owner: 'consumer', work: 'work-1', position: 'position-1', purpose: 'tool-result' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: 0, backgroundAfterMs: null },
  }
}

function rejection(value: unknown) {
  const judged = judgeFixedToolRequest(value)
  if ('ok' in judged) throw new Error('the request was accepted')
  return judged.failure
}

function invokeRequest(): ToolInvokeRequest {
  const { invocation: _invocation, ...payload } = request()
  return payload
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
      [judged.ok.availability.definition.declarations, value.availability.definition.declarations],
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

  const commands = {
    ...invokeRequest(),
    availability: {
      kind: 'available',
      definition: commandsDefinition(),
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
  }
  it.each([
    { name: 'null', input: null, field: 'ToolInvokeRequest', reason: 'type' },
    { name: 'primitive', input: 1, field: 'ToolInvokeRequest', reason: 'type' },
    { name: 'missing fields', input: {}, field: 'availability', reason: 'missing' },
    {
      name: 'caller source',
      input: { ...invokeRequest(), source: evidence('source') },
      field: 'source',
      reason: 'unknown-field',
    },
    {
      name: 'function command',
      input: { ...invokeRequest(), command: 'read' },
      field: 'command',
      reason: 'not-a-command-tool',
    },
    {
      name: 'missing command',
      input: { ...commands, command: null },
      field: 'command',
      reason: 'missing',
    },
    {
      name: 'unknown command',
      input: { ...commands, command: 'write' },
      field: 'command',
      reason: 'unknown-command',
    },
  ])('rejects $name with a structured field and reason', ({ input, field, reason }) => {
    expect(judgeToolInvokeRequest(input)).toEqual({ failure: { field, reason } })
  })

  it('accepts a declared command through the ordinary invoke entry', () => {
    const value = { ...commands, command: 'read' }
    expect(judgeToolInvokeRequest(value)).toEqual({ ok: value })
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
      const { invocation: _invocation, ...payload } = accepted
      expect('ok' in judgeToolInvokeRequest(payload)).toBe(true)
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
      const { invocation: _invocation, ...payload } = { ...request(), workspace: value }
      const invoke = judgeToolInvokeRequest(payload)
      if ('ok' in invoke) throw new Error(`${label} was accepted`)
      expect(invoke.failure, label).toEqual(expected)
    }
    expect(rejection({ ...request(), availability: layer(wrongFamily.value) })).toEqual({
      field: 'availability.layer.workspace.name',
      reason: 'value',
    })
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
    // The scope has no kind: a kind is a field the contract does not know.
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
      environment,
      availability: {
        ...value.availability,
        definition: {
          ...value.availability.definition,
          declarations: { ...value.availability.definition.declarations, environment },
        },
      },
    }
  }

  it('keeps the declaration and scope separately from workspace and concurrency scope', () => {
    const value = declared()
    const judged = judgeFixedToolRequest(value)
    expect(judged).toEqual({ ok: value })
    if ('failure' in judged) throw new Error('valid declaration rejected')
    expect(judged.ok.environment).not.toBe(value.environment)
    expect(judged.ok.requesterScope).not.toBe(value.requesterScope)
    expect(Object.isFrozen(judged.ok.requesterScope)).toBe(true)
  })

  it('rejects bare adoptions and declarations that differ from the selected definition', () => {
    expect(rejection({ ...declared(), environment: adoption('old-environment') }).field).toBe(
      'environment.adoption',
    )
    for (const environment of [
      null,
      { ...declared().environment, adoption: adoption('other-schema') },
      { ...declared().environment, value: { kind: 'null' } },
    ])
      expect(rejection({ ...declared(), environment })).toEqual({
        field: 'environment',
        reason: 'definition-mismatch',
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
