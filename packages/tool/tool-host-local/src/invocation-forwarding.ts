import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  isTenantShape,
  type CallRecord,
  type LedgerDomain,
  type ToolSourceGuard,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  resolveToolInvocationRef,
  type Access,
  type ConsumerRef,
  type FixedToolRequest,
  type Reply,
  type ToolForwardIntent,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  judgeFixedToolRequest,
  judgeToolArguments,
  judgeToolInvokeRequest,
  type ToolForwardBinding,
  type ToolForwardParent,
  type ToolForwardSource,
} from '@omne-harness/tool-contract/provider'
import type { LocalInvocationSourceInput, PrincipalJson } from './invocation-source.ts'
import type { ObserveInvocationRecord } from './invocation-qualification.ts'
import { localArgumentLimits } from './ledger-guards.ts'

export const TOOL_FORWARDING_OWNER = '@omne-harness/tool-host-local/tools-forwarding'
export const forwardingConsumer = (call: string): ConsumerRef => ({
  owner: TOOL_FORWARDING_OWNER,
  work: call,
  position: 'execute',
  purpose: 'tools-target',
})
export const sourceKey = (consumer: ConsumerRef) =>
  `source:${JSON.stringify([consumer.owner, consumer.work, consumer.position, consumer.purpose])}`
export const sourceDomain = (tenant: LedgerDomain['tenant']): LedgerDomain => ({
  kind: 'host',
  tenant,
  key: 'invocation-source',
})
export const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null
export function isPrincipalJson(value: unknown): value is PrincipalJson {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value)
      ? value.every(isPrincipalJson)
      : isObject(value) && Object.values(value).every(isPrincipalJson))
  )
}
function normalizeJson(value: ToolForwardIntent['arguments']): ToolForwardIntent['arguments'] {
  if (value.kind === 'object')
    return {
      kind: 'object',
      entries: [...value.entries]
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map(entry => ({ key: entry.key, value: normalizeJson(entry.value) })),
    }
  if (value.kind === 'array') return { kind: 'array', items: value.items.map(normalizeJson) }
  return value
}
export const forwardingIntentDigest = (intent: ToolForwardIntent) =>
  canonicalDigest({ ...intent, arguments: normalizeJson(intent.arguments) })
const same = (a: unknown, b: unknown) => canonicalDigest(a) === canonicalDigest(b)
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'invocation-source',
    diagnostic: 'The original forwarding association cannot be verified.',
  })
const denied = () => fail({ kind: 'denied' as const, action: 'admit' })

type StoredForward = Readonly<{
  raw: Readonly<Record<string, unknown>>
  call: ToolForwardBinding['call']
  admission: ToolForwardBinding['admission']
  request: FixedToolRequest
  principal: PrincipalJson
  origin: Readonly<Record<string, unknown>>
}>
export function parseForward(value: unknown): StoredForward | null {
  if (
    !isObject(value) ||
    value.kind !== 'invocation-source' ||
    !isObject(value.origin) ||
    value.origin.kind !== 'forwarded' ||
    !isPrincipalJson(value.principal)
  )
    return null
  if (typeof value.call !== 'string' || typeof value.admission !== 'string') return null
  const call = decodeToolCallId(value.call),
    admission = decodeToolOperationId(value.admission)
  const request = judgeFixedToolRequest(value.request)
  if ('failure' in call || 'failure' in admission || 'failure' in request) return null
  const { invocation, ...business } = request.ok
  if (
    value.fixedDigest !== canonicalDigest(request.ok) ||
    value.requestDigest !== canonicalDigest(business) ||
    !same(value.invocation, invocation)
  )
    return null
  return {
    raw: value,
    call: call.ok,
    admission: admission.ok,
    request: request.ok,
    principal: value.principal,
    origin: value.origin,
  }
}
const binding = (stored: StoredForward): ToolForwardBinding => ({
  call: stored.call,
  admission: stored.admission,
  request: stored.request,
  recovered: true,
})

function parsedArguments(request: FixedToolRequest | ToolInvokeRequest) {
  const cut = commandArguments(request.availability.definition, request.command, request.arguments)
  return 'failure' in cut
    ? null
    : (() => {
        const parsed = judgeToolArguments(cut.ok, localArgumentLimits)
        return 'failure' in parsed ? null : parsed.ok.effective
      })()
}
export function forwardIntentOf(request: FixedToolRequest): ToolForwardIntent | null {
  const args = parsedArguments(request)
  if (args?.kind !== 'object') return null
  const get = (key: string) => args.entries.find(entry => entry.key === key)?.value
  const name = get('name'),
    command = get('command'),
    argumentsValue = get('arguments')
  if (
    name?.kind !== 'string' ||
    argumentsValue === undefined ||
    (command?.kind !== 'string' && command?.kind !== 'null')
  )
    return null
  return {
    name: name.value,
    command: command.kind === 'null' ? null : command.value,
    arguments: normalizeJson(argumentsValue),
  }
}
function matchesTarget(
  parent: FixedToolRequest,
  intent: ToolForwardIntent,
  target: ToolInvokeRequest,
): boolean {
  const targetArguments = parsedArguments(target)
  if (
    intent.name === 'Tools' ||
    target.availability.definition.name !== intent.name ||
    target.command !== intent.command ||
    !same(
      targetArguments === null ? null : normalizeJson(targetArguments),
      normalizeJson(intent.arguments),
    )
  )
    return false
  if (
    parent.invocation.kind === 'programmatic' &&
    target.availability.definition.programmable !== true
  )
    return false
  if (target.batchDecision !== null) return false
  return (
    ['scope', 'requesterScope', 'context', 'workspace', 'resources', 'limits', 'mode'] as const
  ).every(key => same(parent[key], target[key]))
}

export function createInvocationForwarding<P, B extends ContentBlock>(
  input: LocalInvocationSourceInput<P, B>,
  directGuard: ToolSourceGuard<P>,
  identitiesOf: (
    tenant: LedgerDomain['tenant'],
    consumer: ConsumerRef,
  ) => Pick<ToolForwardBinding, 'call' | 'admission'>,
  observe?: ObserveInvocationRecord,
) {
  const readParent = async (
    access: Access<P> & { call: ToolForwardBinding['call'] },
  ): Reply<CallRecord> => {
    if (!isTenantShape(access.tenant)) return denied()
    const read = await input.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
    if (read.kind !== 'complete') return unavailable()
    const row = read.records.find(row => row.kind === 'call')
    if (row !== undefined)
      observe?.({ kind: 'call', tenant: access.tenant, call: access.call }, row)
    return row?.kind === 'call' &&
      row.call.call === access.call &&
      same(row.call.tenant, access.tenant)
      ? succeed(row.call)
      : denied()
  }
  const checkParent = async (parent: ToolForwardParent<P>): Reply<CallRecord> => {
    const read = await readParent(parent)
    if ('failure' in read) return read
    const row = read.ok
    if (
      row.start === null ||
      !same(row.start, parent.start) ||
      !same(row.request, parent.request) ||
      !same(row.start.execution.tenant, parent.tenant) ||
      row.start.execution.call !== parent.call ||
      row.request.command !== 'execute'
    )
      return denied()
    if (input.forwarding === undefined) return unavailable()
    if (!input.forwarding.isParent(row.request)) return denied()
    const authority = input.forwarding.authority()
    if (authority === undefined) return unavailable()
    const started = await authority.inspect({ ...parent, start: row.start })
    if ('failure' in started) return started
    if (started.ok.kind !== 'started') return unavailable()
    const source = await directGuard.verify({
      ...parent,
      operation: row.admission,
      request: row.request,
    })
    if (source.kind === 'forged' || source.kind === 'denied') return denied()
    if (source.kind !== 'trusted') return unavailable()
    const qualified = await input.authority.qualify({ ...parent, consumer: row.request.consumer })
    if (qualified.kind === 'denied') return denied()
    return qualified.kind === 'allowed' ? succeed(row) : unavailable()
  }
  const verifyStored = async (access: Access<P>, stored: StoredForward): Reply<CallRecord> => {
    const decoded = input.principalCodec.decode(stored.principal)
    if ('failure' in decoded) return unavailable()
    const subject = await input.authority.samePrincipal({
      current: access.principal,
      original: decoded.ok,
    })
    if (subject.kind === 'denied') return denied()
    if (subject.kind !== 'allowed') return unavailable()
    if (typeof stored.origin.parent !== 'string') return unavailable()
    const id = decodeToolCallId(stored.origin.parent)
    if ('failure' in id) return unavailable()
    const read = await readParent({ ...access, call: id.ok })
    if ('failure' in read || read.ok.start === null) return unavailable()
    const parent = read.ok
    if (parent.start === null) return unavailable()
    const checked = await checkParent({
      ...access,
      call: parent.call,
      start: parent.start,
      request: parent.request,
    })
    if ('failure' in checked) return checked
    const intent = forwardIntentOf(parent.request)
    const origin = stored.origin
    const { invocation, ...target } = stored.request
    const expected = identitiesOf(access.tenant, forwardingConsumer(parent.call))
    if (
      intent === null ||
      origin.slot !== 'execute' ||
      origin.admission !== parent.admission ||
      origin.requestDigest !== canonicalDigest(parent.request) ||
      !same(origin.start, parent.start) ||
      !same(origin.intent, intent) ||
      origin.intentDigest !== canonicalDigest(intent) ||
      !same(invocation, parent.request.invocation) ||
      !same(stored.request.consumer, forwardingConsumer(parent.call)) ||
      !same(expected, { call: stored.call, admission: stored.admission }) ||
      !matchesTarget(parent.request, intent, target)
    )
      return denied()
    return succeed(parent)
  }
  const storedOf = async (access: Access<P>, consumer: ConsumerRef) => {
    const read = await input.store.read(sourceDomain(access.tenant))
    if (read.kind !== 'complete') return unavailable()
    const row = read.records.find(
      row => row.kind === 'host' && row.host.key === sourceKey(consumer),
    )
    if (row === undefined) return succeed({ read, stored: null })
    observe?.(sourceDomain(access.tenant), row)
    const stored = row.kind === 'host' ? parseForward(row.host.value) : null
    return stored === null ? unavailable() : succeed({ read, stored })
  }
  const recoverBinding = async (
    access: Access<P> & Pick<ToolForwardBinding, 'call' | 'admission' | 'request'>,
  ): Reply<{ principal: PrincipalJson }> => {
    const found = await storedOf(access, access.request.consumer)
    if ('failure' in found) return found
    const stored = found.ok.stored
    if (
      stored === null ||
      stored.call !== access.call ||
      stored.admission !== access.admission ||
      !same(stored.request, access.request)
    )
      return denied()
    const checked = await verifyStored(access, stored)
    return 'failure' in checked ? checked : succeed({ principal: stored.principal })
  }
  const source: ToolForwardSource<P> = {
    async resolve(given) {
      try {
        const fixed = judgeFixedToolRequest(given.request)
        if ('failure' in fixed)
          return { kind: 'rejected', failure: { kind: 'invalid', ...fixed.failure } }
        const intentSnapshot = structuredClone(given.intent)
        const targetSnapshot = judgeToolInvokeRequest({
          ...given.target,
          consumer: forwardingConsumer(given.call),
        })
        const parent = { ...given, request: fixed.ok, start: structuredClone(given.start) }
        const checked = await checkParent(parent)
        if ('failure' in checked)
          return checked.failure.kind === 'commit-unknown'
            ? { kind: 'association-unknown' }
            : { kind: 'rejected', failure: checked.failure }
        const intent = forwardIntentOf(parent.request)
        if (intent === null)
          return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
        const consumer = forwardingConsumer(parent.call)
        const ids = identitiesOf(parent.tenant, consumer)
        for (let attempt = 0; attempt < input.commitAttempts; attempt++) {
          const found = await storedOf(parent, consumer)
          if ('failure' in found) return { kind: 'association-unknown' }
          const known = found.ok.stored
          if (known !== null) {
            const current = await verifyStored(parent, known)
            if ('failure' in current)
              return current.failure.kind === 'commit-unknown'
                ? { kind: 'association-unknown' }
                : { kind: 'rejected', failure: current.failure }
            if (
              forwardingIntentDigest(intent) !== forwardingIntentDigest(intentSnapshot) ||
              !same(known.origin.start, parent.start)
            )
              return { kind: 'rejected', failure: { kind: 'conflict', operation: known.admission } }
            return { kind: 'bound', ...binding(known) }
          }
          if (forwardingIntentDigest(intent) !== forwardingIntentDigest(intentSnapshot))
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          const judged = targetSnapshot
          if ('failure' in judged)
            return { kind: 'rejected', failure: { kind: 'invalid', ...judged.failure } }
          if (!matchesTarget(parent.request, intent, judged.ok))
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          const request = { ...judged.ok, invocation: parent.request.invocation }
          const value = {
            kind: 'invocation-source',
            ...ids,
            request,
            requestDigest: canonicalDigest(judged.ok),
            fixedDigest: canonicalDigest(request),
            invocation: request.invocation,
            principal: input.principalCodec.encode(parent.principal),
            received: [],
            origin: {
              kind: 'forwarded',
              parent: parent.call,
              admission: checked.ok.admission,
              start: parent.start,
              requestDigest: canonicalDigest(parent.request),
              slot: 'execute',
              intent,
              intentDigest: canonicalDigest(intent),
            },
          }
          const { read } = found.ok
          const revision = nextSourceRevision(read.revision)
          let commit
          try {
            commit = await input.store.commit({
              domain: sourceDomain(parent.tenant),
              expected: read.revision,
              revision,
              writes: [
                {
                  kind: 'put',
                  record: { kind: 'host', host: { key: sourceKey(consumer), value } },
                },
              ],
            })
          } catch {
            return { kind: 'issuance-unknown', ...ids }
          }
          if (commit.kind === 'committed')
            return { kind: 'bound', ...ids, request, recovered: false }
          if (commit.kind === 'unknown') return { kind: 'issuance-unknown', ...ids }
          if (commit.kind === 'unavailable')
            return {
              kind: 'rejected',
              failure: {
                kind: 'unavailable',
                dependency: 'invocation-source',
                diagnostic: commit.diagnostic,
              },
            }
        }
        return { kind: 'association-unknown' }
      } catch {
        return { kind: 'association-unknown' }
      }
    },
    async lookup(access) {
      try {
        const ref = resolveToolInvocationRef(access.reference, access.tenant)
        if ('failure' in ref) return denied()
        const parent = await readParent({ ...access, call: ref.ok.call })
        if ('failure' in parent) return parent
        if (parent.ok.admission !== ref.ok.admission) return denied()
        const found = await storedOf(access, forwardingConsumer(parent.ok.call))
        if ('failure' in found) return found
        if (found.ok.stored === null) {
          if (parent.ok.start === null) return denied()
          const checked = await checkParent({
            ...access,
            call: parent.ok.call,
            request: parent.ok.request,
            start: parent.ok.start,
          })
          return 'failure' in checked ? checked : succeed({ kind: 'unresolved' })
        }
        const checked = await verifyStored(access, found.ok.stored)
        return 'failure' in checked
          ? checked
          : succeed({ kind: 'bound', binding: binding(found.ok.stored) })
      } catch {
        return unavailable()
      }
    },
  }
  return { source, recoverBinding, verifyStored, storedOf }
}

import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
export function nextSourceRevision(revision: string) {
  const parsed = decodeToolRevision((BigInt(revision) + 1n).toString())
  if ('failure' in parsed) throw new Error('Invalid invocation source revision')
  return parsed.ok
}
