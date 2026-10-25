import { describe, expect, it } from 'vitest'
import {
  judgeFixedToolRequest,
  judgeToolInvokeRequest,
  type FixedToolRequest,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { adoption, commandsDefinition, evidence, functionDefinition } from './tool-values.ts'

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
    environment: adoption('environment'),
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
    ).toEqual({ field: 'availability.layer.workspace', reason: 'empty' })
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
