import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'

import { fail, succeed } from '@omne-harness/operation-result'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { CallRecord, ToolLedgerStore } from '@omne-harness/tool'
import {
  encodeToolInvocationRef,
  type FixedToolRequest,
  type ToolForwardIntent,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  decodeToolRevision,
  decodeToolResultVersion,
  type ToolForwardParent,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalInvocationSource,
  createLocalStartCoordinator,
} from '@omne-harness/tool-host-local'
import { adoption, evidence, request, startOf, tenantA } from './coordinator-values.ts'

export function ok<T>(result: { ok: T } | { failure: unknown }): T {
  if ('failure' in result) throw new Error(JSON.stringify(result.failure))
  return result.ok
}
export const targetIntent: ToolForwardIntent = {
  name: 'read_file',
  command: null,
  arguments: {
    kind: 'object',
    entries: [{ key: 'path', value: { kind: 'string', value: 'a.txt' } }],
  },
}
export function parentRequest(): ToolInvokeRequest {
  const { invocation: _, ...base } = request()
  const definition = base.availability.definition
  const text = JSON.stringify({
    command: 'execute',
    params: { name: 'read_file', command: null, arguments: { path: 'a.txt' } },
  })
  return {
    ...base,
    command: 'execute',
    arguments: { original: text, effective: text, complete: true },
    availability: {
      ...base.availability,
      definition: {
        name: 'Tools',
        adoption: adoption('Tools'),
        description: definition.description,
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: definition.declarations,
        kind: 'commands',
        encoding: 'wrapped',
        commands: [
          {
            name: 'execute',
            summary: 'Execute one target',
            parameters: { kind: 'executor-owned' },
            returns: ordinaryReturnFixture(adoption('codec')),
          },
        ],
      },
    },
  }
}
export async function forwardingFixture(
  options: { durableDeclaration?: boolean; consumed?: boolean } = {},
) {
  const memory = createMemoryToolLedgerStore()
  let nextCommit: 'lost' | 'unwritten' | 'unavailable' | 'rejected' | null = null
  let allowed = true
  const store: ToolLedgerStore = {
    durability: options.durableDeclaration ? 'durable' : 'none',
    read: memory.read,
    readRecord: memory.readRecord,
    due: memory.due,
    async commit(input) {
      const fault = nextCommit
      nextCommit = null
      if (fault === 'lost') {
        await memory.commit(input)
        return { kind: 'unknown', diagnostic: 'reply lost' }
      }
      if (fault === 'unwritten') return { kind: 'unknown', diagnostic: 'unconfirmed' }
      if (fault === 'unavailable') return { kind: 'unavailable', diagnostic: 'offline' }
      if (fault === 'rejected') return { kind: 'rejected', reason: 'command_limit' }
      return memory.commit(input)
    },
  }
  const authority = createLocalStartCoordinator<string>({
    store,
    commitAttempts: 8,
    guardsOf: () => [],
    access: {
      qualify: async () => (allowed ? { kind: 'allowed' } : { kind: 'denied', reason: 'revoked' }),
    },
    permitRequirements: {
      check: async () => ({ kind: 'not-required', source: evidence('no-permit') }),
    },
  })
  const input = {
    store,
    commitAttempts: 8,
    authority: {
      qualify: async () =>
        allowed ? { kind: 'allowed' as const } : { kind: 'denied' as const, reason: 'revoked' },
      samePrincipal: async ({ current, original }: { current: string; original: string }) =>
        current === original
          ? { kind: 'allowed' as const }
          : { kind: 'denied' as const, reason: 'other' },
    },
    principalCodec: {
      encode: (principal: string) => principal,
      decode: (value: unknown) =>
        typeof value === 'string' ? succeed(value) : fail({ reason: 'not a string' }),
    },
    forwarding: {
      authority: () => authority,
      isParent: (fixed: FixedToolRequest) =>
        fixed.availability.definition.adoption.name === 'Tools',
    },
  }
  const source = createLocalInvocationSource(input)
  const business = parentRequest()
  // Rebuild without function-only declaration fields when using a command definition.
  const definition = business.availability.definition
  if (definition.kind !== 'commands') throw new Error('commands required')
  const cleaned = {
    ...business,
    availability: {
      ...business.availability,
      definition: {
        name: definition.name,
        adoption: definition.adoption,
        description: definition.description,
        requiredCapabilities: definition.requiredCapabilities,
        backgroundAllowed: definition.backgroundAllowed,
        declarations: definition.declarations,
        kind: definition.kind,
        encoding: definition.encoding,
        commands: definition.commands,
      },
    },
  }
  const issued = await source.issuer.resolve({
    principal: 'alice',
    tenant: tenantA,
    request: cleaned,
  })
  if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
  const fixed = { ...cleaned, invocation: issued.invocation }
  const parent: ToolForwardParent<string> = {
    principal: 'alice',
    tenant: tenantA,
    call: issued.call,
    start: startOf(issued.call),
    request: fixed,
  }
  const permit = ok(await authority.prepare(parent))
  const state: CallRecord['state'] = {
    call: parent.call,
    revision: ok(decodeToolRevision('1')),
    source: evidence('parent-state'),
    foreground: null,
    effect: { kind: 'not-started' },
    execution: { kind: 'not-started' },
    timing: { kind: 'closed', accumulatedMs: '0' },
    queue: { kind: 'none' },
    controls: [],
    delivery: null,
    supplements: [],
    phase: 'settled',
    wait: { kind: 'none' },
    result: ok(decodeToolResultVersion('parent-result')),
    relation: 'foreground',
    terminal: { kind: 'completed' },
  }
  const call: CallRecord = {
    tenant: tenantA,
    call: parent.call,
    admission: issued.admission,
    request: fixed,
    initiator: { owner: 'fixture', subject: 'alice', revision: '1' },
    state,
    preparations: [],
    environment: null,
    start: parent.start,
    startRejection: null,
    execution: null,
  }
  const saved = await store.commit({
    domain: { kind: 'call', tenant: tenantA, call: parent.call },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [{ kind: 'put', record: { kind: 'call', call } }],
  })
  if (saved.kind !== 'committed') throw new Error('parent commit failed')
  const consume = () =>
    authority.consume({ ...parent, permit, executorReceipt: evidence('parent-executor') })
  if (options.consumed !== false) ok(await consume())
  const { invocation: __, ...target } = request()
  return {
    memory,
    store,
    authority,
    source,
    input,
    parent,
    call,
    target,
    intent: targetIntent,
    reference: ok(
      encodeToolInvocationRef({ tenant: tenantA, call: parent.call, admission: issued.admission }),
    ),
    consume,
    arm: (fault: typeof nextCommit) => {
      nextCommit = fault
    },
    revoke: () => {
      allowed = false
    },
  }
}
