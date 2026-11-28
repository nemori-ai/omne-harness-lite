import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  hostKey,
  recordKey,
  type CallRecord,
  type HostRecord,
  type LedgerDomain,
  type ToolLedgerStore,
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
  type ToolCallFields,
  type ToolCallId,
  type ToolForwardIntent,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  fixedRequestReference,
  judgeFixedToolRequest,
  judgeToolArguments,
  judgeToolInvokeRequest,
  toolInvokeRequestOf,
  type ToolForwardBinding,
  type ToolForwardParent,
  type ToolForwardSource,
} from '@omne-harness/tool-contract/provider'
import type { ResolveDefinition } from './definition-resolution.ts'
import type { LocalInvocationSourceInput, PrincipalJson } from './invocation-source.ts'
import { localArgumentLimits } from './ledger-guards.ts'
import { isReceivedCopyKey, receivedCopyKey, sourceDomain, sourceKey } from './source-identities.ts'
import { createParentChecks } from './source-parent.ts'

export { isReceivedCopyKey, receivedCopyKey, sourceDomain, sourceKey }

export const TOOL_FORWARDING_OWNER = '@omne-harness/tool-host-local/tools-forwarding'
export const forwardingConsumer = (call: string): ConsumerRef => ({
  owner: TOOL_FORWARDING_OWNER,
  work: call,
  position: 'execute',
  purpose: 'tools-target',
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

export type StoredForward = Readonly<{
  raw: Readonly<Record<string, unknown>>
  call: ToolForwardBinding['call']
  admission: ToolForwardBinding['admission']
  request: FixedToolRequest
  principal: PrincipalJson
  origin: Readonly<Record<string, unknown>>
}>
export const parseForward = (host: HostRecord) => parseIssued(host, 'forwarded')

/** A source this host issued for a call another call made: forwarded by `Tools`, or one position of a program. */
export function parseIssued(
  host: HostRecord,
  origin: 'forwarded' | 'program',
): StoredForward | null {
  const { value } = host
  if (
    !isObject(value) ||
    value.kind !== 'invocation-source' ||
    !isObject(value.origin) ||
    value.origin.kind !== origin ||
    !isPrincipalJson(value.principal)
  )
    return null
  if (typeof value.call !== 'string' || typeof value.admission !== 'string') return null
  const call = decodeToolCallId(value.call),
    admission = decodeToolOperationId(value.admission)
  const request = judgeFixedToolRequest(host.request)
  if ('failure' in call || 'failure' in admission || 'failure' in request) return null
  if (
    value.fixedDigest !== canonicalDigest(fixedRequestReference(request.ok)) ||
    value.requestDigest !== canonicalDigest(toolInvokeRequestOf(request.ok)) ||
    !same(value.invocation, request.ok.invocation)
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
export const issuedBinding = (stored: StoredForward): ToolForwardBinding => ({
  call: stored.call,
  admission: stored.admission,
  request: stored.request,
  recovered: true,
})

type CallParts = Readonly<{
  definition: FixedToolRequest['availability']['definition']
  command: string | null
  arguments: FixedToolRequest['arguments']
}>
type TargetCall = Omit<FixedToolRequest, 'invocation'>
const partsOf = (request: TargetCall): CallParts => ({
  definition: request.availability.definition,
  command: request.command,
  arguments: request.arguments,
})
function parsedArguments(call: CallParts) {
  const cut = commandArguments(call.definition, call.command, call.arguments)
  return 'failure' in cut
    ? null
    : (() => {
        const parsed = judgeToolArguments(cut.ok, localArgumentLimits)
        return 'failure' in parsed ? null : parsed.ok.effective
      })()
}
export function forwardIntentOf(request: FixedToolRequest): ToolForwardIntent | null {
  return forwardIntentOfCall(partsOf(request))
}
type IntentValue = ToolForwardIntent['arguments']

const intentCommandOf = (value: IntentValue | undefined): string | null | undefined => {
  if (value?.kind === 'string') return value.value
  return value?.kind === 'null' ? null : undefined
}

/** The target a `Tools` execute call names, read from the call's own definition, command and arguments. */
export function forwardIntentOfCall(call: CallParts): ToolForwardIntent | null {
  const args = parsedArguments(call)
  if (args?.kind !== 'object') return null
  const get = (key: string) => args.entries.find(entry => entry.key === key)?.value
  const name = get('name')
  const command = intentCommandOf(get('command'))
  const argumentsValue = get('arguments')
  if (name?.kind !== 'string' || argumentsValue === undefined || command === undefined) return null
  return { name: name.value, command, arguments: normalizeJson(argumentsValue) }
}
const PINNED = ['scope', 'requesterScope', 'context', 'workspace', 'resources'] as const
/** What every call a call makes takes from it as it is; the pinned directory too, absent or not. */
export const pinnedOf = (request: ToolCallFields): readonly unknown[] => [
  ...PINNED.map(key => request[key]),
  request.directory ?? null,
]
const inheritedOf = (request: ToolCallFields) => [
  ...pinnedOf(request),
  request.limits,
  request.mode,
]

function matchesTarget(
  parent: FixedToolRequest,
  intent: ToolForwardIntent,
  target: TargetCall,
): boolean {
  const targetArguments = parsedArguments(partsOf(target))
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
  if (target.batchDecision !== null) return false
  return same(inheritedOf(parent), inheritedOf(target))
}

const sameRequest = (left: FixedToolRequest, right: FixedToolRequest) =>
  same(fixedRequestReference(left), fixedRequestReference(right))

export function forwardCommitted(
  commit: Awaited<ReturnType<ToolLedgerStore['commit']>>,
  ids: Pick<ToolForwardBinding, 'call' | 'admission'>,
  request: FixedToolRequest,
): Awaited<ReturnType<ToolForwardSource<unknown>['resolve']>> | null {
  if (commit.kind === 'committed') return { kind: 'bound', ...ids, request, recovered: false }
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
  if (commit.kind === 'rejected')
    return {
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'storage', reason: commit.reason },
    }
  return null
}

export async function readIssued(
  store: ToolLedgerStore,
  tenant: LedgerDomain['tenant'],
  consumer: ConsumerRef,
  origin: 'forwarded' | 'program',
) {
  const read = await store.readRecord(sourceDomain(tenant, consumer), hostKey(sourceKey(consumer)))
  if (read.kind !== 'complete') return unavailable()
  const row = read.record
  if (row === null) return succeed({ read, stored: null })
  const stored = row.kind === 'host' ? parseIssued(row.host, origin) : null
  return stored === null ? unavailable() : succeed({ read, stored })
}

// Tool may delete a parent's records before its forwarded child's: the binding stored when it forwarded then stands.
async function standsAlone<P>(
  input: LocalInvocationSourceInput<P>,
  access: Access<P>,
  stored: StoredForward,
): Promise<boolean> {
  const decoded = input.principalCodec.decode(stored.principal)
  if ('failure' in decoded || typeof stored.origin.parent !== 'string') return false
  const subject = await input.authority.samePrincipal({
    current: access.principal,
    original: decoded.ok,
  })
  const id = decodeToolCallId(stored.origin.parent)
  if (subject.kind !== 'allowed' || 'failure' in id) return false
  const read = await input.store.read({ kind: 'call', tenant: access.tenant, call: id.ok })
  return read.kind === 'complete' && !read.records.some(row => row.kind === 'call')
}

type Recover<P> = (
  access: Access<P> & Pick<ToolForwardBinding, 'call' | 'admission' | 'request'>,
) => Reply<{ principal: PrincipalJson }>

function standingAlone<P>(
  input: LocalInvocationSourceInput<P>,
  recover: Recover<P>,
  storedOf: (access: Access<P>, consumer: ConsumerRef) => ReturnType<typeof readIssued>,
): Recover<P> {
  return async access => {
    const recovered = await recover(access)
    if ('ok' in recovered || recovered.failure.kind === 'denied') return recovered
    const found = await storedOf(access, access.request.consumer)
    const stored = 'ok' in found ? found.ok.stored : null
    return stored !== null && (await standsAlone(input, access, stored))
      ? succeed({ principal: stored.principal })
      : recovered
  }
}

function forwardingOf<P>(
  input: LocalInvocationSourceInput<P>,
  directGuard: ToolSourceGuard<P>,
  identitiesOf: (
    tenant: LedgerDomain['tenant'],
    consumer: ConsumerRef,
  ) => Pick<ToolForwardBinding, 'call' | 'admission'>,
  resolveDefinition: ResolveDefinition<P>,
) {
  const { readParent, checkParent: checkStarted } = createParentChecks(input, directGuard)
  const checkParent = (parent: ToolForwardParent<P>) =>
    checkStarted(parent, input.forwarding, row => row.request.command === 'execute')
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
    if (parent.start?.kind !== 'start') return unavailable()
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
      origin.requestDigest !== canonicalDigest(fixedRequestReference(parent.request)) ||
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
  const storedOf = (access: Access<P>, consumer: ConsumerRef) =>
    readIssued(input.store, access.tenant, consumer, 'forwarded')
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
      !sameRequest(stored.request, access.request)
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
            return { kind: 'bound', ...issuedBinding(known) }
          }
          if (forwardingIntentDigest(intent) !== forwardingIntentDigest(intentSnapshot))
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          const judged = targetSnapshot
          if ('failure' in judged)
            return { kind: 'rejected', failure: { kind: 'invalid', ...judged.failure } }
          const availability = await resolveDefinition(parent, judged.ok.availability)
          if ('failure' in availability) return { kind: 'rejected', failure: availability.failure }
          const target = { ...judged.ok, availability: availability.ok }
          if (!matchesTarget(parent.request, intent, target))
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          const request = { ...target, invocation: parent.request.invocation }
          const value = {
            kind: 'invocation-source',
            ...ids,
            requestDigest: canonicalDigest(judged.ok),
            fixedDigest: canonicalDigest(fixedRequestReference(request)),
            invocation: request.invocation,
            principal: input.principalCodec.encode(parent.principal),
            origin: {
              kind: 'forwarded',
              parent: parent.call,
              admission: checked.ok.admission,
              start: parent.start,
              requestDigest: canonicalDigest(fixedRequestReference(parent.request)),
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
              domain: sourceDomain(parent.tenant, consumer),
              expected: read.revision,
              revision,
              writes: [
                {
                  kind: 'put',
                  record: { kind: 'host', host: { key: sourceKey(consumer), value, request } },
                },
              ],
            })
          } catch {
            return { kind: 'issuance-unknown', ...ids }
          }
          const outcome = forwardCommitted(commit, ids, request)
          if (outcome !== null) return outcome
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
          if (parent.ok.start?.kind !== 'start') return denied()
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
          : succeed({ kind: 'bound', binding: issuedBinding(found.ok.stored) })
      } catch {
        return unavailable()
      }
    },
  }
  const releaseReceivedCopies = async (
    given: Readonly<{
      tenant: LedgerDomain['tenant']
      call: ToolCallId
      request: FixedToolRequest
    }>,
  ): Promise<'released' | 'unavailable'> => {
    if (input.forwarding === undefined || !input.forwarding.isParent(given.request))
      return 'released'
    const consumer = forwardingConsumer(given.call)
    const domain = sourceDomain(given.tenant, consumer)
    for (let attempt = 0; attempt < input.commitAttempts; attempt++) {
      const read = await input.store.read(domain)
      if (read.kind !== 'complete') return 'unavailable'
      const copies = read.records.filter(
        row => row.kind === 'host' && isReceivedCopyKey(consumer, row.host.key),
      )
      if (copies.length === 0) return 'released'
      let committed
      try {
        committed = await input.store.commit({
          domain,
          expected: read.revision,
          revision: nextSourceRevision(read.revision),
          writes: copies.map(row => ({ kind: 'delete' as const, key: recordKey(row) })),
        })
      } catch {
        return 'unavailable'
      }
      if (committed.kind === 'committed') return 'released'
      if (committed.kind === 'unavailable') return 'unavailable'
    }
    return 'unavailable'
  }
  return { source, recoverBinding, verifyStored, storedOf, releaseReceivedCopies }
}

import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
export function nextSourceRevision(revision: string) {
  const parsed = decodeToolRevision((BigInt(revision) + 1n).toString())
  if ('failure' in parsed) throw new Error('Invalid invocation source revision')
  return parsed.ok
}

// A parent releases what it received for its target only once it brought the result back; one that answered
// pending keeps it for a later read. The marks live in this process: after a restart nothing is released.
export function createInvocationForwarding<P>(
  ...args: Parameters<typeof forwardingOf<P>>
): ReturnType<typeof forwardingOf<P>> {
  const forwards = forwardingOf(...args)
  const presented = new Set<string>()
  const keyOf = (parent: Readonly<{ tenant: unknown; call: ToolCallId }>) =>
    JSON.stringify([parent.tenant, parent.call])
  return {
    ...forwards,
    recoverBinding: standingAlone(args[0], forwards.recoverBinding, forwards.storedOf),
    source: { ...forwards.source, presented: parent => void presented.add(keyOf(parent)) },
    async releaseReceivedCopies(given) {
      if (!presented.has(keyOf(given))) return 'released'
      const released = await forwards.releaseReceivedCopies(given)
      if (released === 'released') presented.delete(keyOf(given))
      return released
    },
  }
}
