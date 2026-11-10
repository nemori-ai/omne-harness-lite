import type { ContentBlock } from '@omne-harness/content-block'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { expect } from 'vitest'
import type { CallRecord } from '@omne-harness/tool'
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import { decodeToolRevision, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import {
  createLocalInvocationSource,
  createLocalInvocationQualifier,
  createLocalStartCoordinator,
  type LocalInvocationSourceInput,
} from '@omne-harness/tool-host-local'
import {
  parentRequest,
  ok,
} from '../../../../../packages/tool/tool-host-local/tests/forwarding-values.ts'
import {
  evidence,
  startOf,
} from '../../../../../packages/tool/tool-host-local/tests/coordinator-values.ts'

export function captureParentRequest(target: ToolInvokeRequest): ToolInvokeRequest {
  const parent = parentRequest()
  const text = JSON.stringify({
    command: 'execute',
    params: { name: target.availability.definition.name, command: target.command, arguments: {} },
  })
  return {
    ...target,
    availability: parent.availability,
    command: 'execute',
    arguments: { original: text, effective: text, complete: true },
  }
}

/** Real source and start consumption over the supplied SQL store; the completed parent is setup. */
export async function forwardCapture(
  input: LocalInvocationSourceInput<ActingForTenantPrincipal>,
  principal: ActingForTenantPrincipal,
  business: ToolInvokeRequest,
  target: ToolInvokeRequest,
) {
  const tenant = principal.tenant
  const authority = createLocalStartCoordinator<ActingForTenantPrincipal, ContentBlock>({
    store: input.store,
    commitAttempts: 8,
    guardsOf: () => [],
    access: {
      qualify: ({ principal, tenant }) =>
        input.authority.qualify({ principal, tenant, consumer: business.consumer }),
    },
    permitRequirements: {
      check: async () => ({ kind: 'not-required', source: evidence('capture-no-start-permit') }),
    },
  })
  let loseReply = false
  const configured: LocalInvocationSourceInput<ActingForTenantPrincipal> = {
    ...input,
    store: {
      durability: input.store.durability,
      read: input.store.read,
      async commit(command) {
        const result = await input.store.commit(command)
        if (loseReply && result.kind === 'committed') {
          loseReply = false
          return { kind: 'unknown', diagnostic: 'committed reply lost by fixture' }
        }
        return result
      },
    },
    forwarding: {
      authority: () => authority,
      isParent: request => request.availability.definition.adoption.name === 'Tools',
    },
  }
  const source = createLocalInvocationSource(configured)
  const issued = await source.issuer.resolve({ principal, tenant, request: business })
  if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
  const parent = {
    principal,
    tenant,
    call: issued.call,
    start: startOf(issued.call, tenant),
    request: { ...business, invocation: issued.invocation },
  }
  const permit = ok(await authority.prepare(parent))
  const call: CallRecord = {
    tenant,
    call: parent.call,
    admission: issued.admission,
    request: parent.request,
    initiator: { owner: 'capture-fixture', subject: 'original-login', revision: '1' },
    state: {
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
    },
    preparations: [],
    environment: null,
    start: parent.start,
    startRejection: null,
    execution: null,
  }
  const saved = await input.store.commit({
    domain: { kind: 'call', tenant, call: parent.call },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [{ kind: 'put', record: { kind: 'call', call } }],
  })
  if (saved.kind !== 'committed') throw new Error('Parent setup did not commit')
  ok(
    await authority.consume({
      ...parent,
      permit,
      executorReceipt: evidence('capture-parent-executor'),
    }),
  )
  const request = {
    ...parent,
    intent: {
      name: target.availability.definition.name,
      command: target.command,
      arguments: { kind: 'object' as const, entries: [] },
    },
    target,
  }
  loseReply = true
  const lost = await source.forwarding.resolve(request)
  expect(lost.kind).toBe('issuance-unknown')
  if (lost.kind !== 'issuance-unknown') throw new Error(JSON.stringify(lost))
  const rebuilt = createLocalInvocationSource(configured)
  const recovered = await Promise.all(
    Array.from({ length: 6 }, () => rebuilt.forwarding.resolve(request)),
  )
  for (const result of recovered)
    expect(result).toMatchObject({
      kind: 'bound',
      recovered: true,
      call: lost.call,
      admission: lost.admission,
    })
  const forwarded = recovered[0]
  if (forwarded?.kind !== 'bound') throw new Error(JSON.stringify(forwarded))

  return {
    call: forwarded.call,
    admission: forwarded.admission,
    request: forwarded.request,
    qualifier: createLocalInvocationQualifier(configured),
  }
}
