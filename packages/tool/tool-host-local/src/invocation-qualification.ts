import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  recordKey,
  type LedgerDomain,
  type LedgerRecord,
  type ToolSourceGuard,
} from '@omne-harness/tool'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Reply,
  FixedToolRequest,
  ToolCallId,
  ToolOperationId,
} from '@omne-harness/tool-contract'

export type InvocationQualificationRequest<P> = Readonly<{
  principal: P
  tenant: LedgerDomain['tenant']
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
}>
export type InvocationRecordObservation = Readonly<{
  domain: Exclude<LedgerDomain, { kind: 'queue' }>
  key: string
  digest: string
}>
export type InvocationOrigin = Pick<
  InvocationQualificationRequest<unknown>,
  'call' | 'admission' | 'request'
>
export type ObserveInvocationOrigin = (origin: InvocationOrigin) => void
export type InvocationQualification = Readonly<{
  version: 1
  request: Omit<InvocationQualificationRequest<unknown>, 'principal'>
  origin: InvocationOrigin
  records: readonly InvocationRecordObservation[]
}>
export interface LocalInvocationQualifier<P> {
  qualify(input: InvocationQualificationRequest<P>): Reply<InvocationQualification>
}

/** Internal hook on records the source guard actually reads, never on caller-supplied evidence. */
export type ObserveInvocationRecord = (
  domain: LedgerDomain,
  record: LedgerRecord<ContentBlock>,
) => void

function observations() {
  const records = new Map<string, InvocationRecordObservation>()
  const observe: ObserveInvocationRecord = (domain, record) => {
    if (domain.kind === 'queue') throw new Error('An invocation source cannot depend on a queue')
    const key = recordKey(record)
    const identity = canonicalDigest({ domain, key })
    const digest = canonicalDigest(record)
    const previous = records.get(identity)
    if (previous !== undefined && previous.digest !== digest)
      throw new Error('The original source changed during qualification')
    records.set(identity, { domain: { ...domain }, key, digest })
  }
  return { observe, values: () => [...records.values()] }
}

export function invocationQualifier<P>(
  guardOf: (
    observe: ObserveInvocationRecord,
    origin: ObserveInvocationOrigin,
  ) => ToolSourceGuard<P>,
): LocalInvocationQualifier<P> {
  return {
    async qualify(input) {
      try {
        const { principal, tenant, ...given } = input
        // TenantId is an immutable value minted by legal-identity, not cloneable wire data.
        const request = { tenant, ...structuredClone(given) }
        const recorded = observations()
        let origin: InvocationOrigin | undefined
        const observeOrigin: ObserveInvocationOrigin = value => {
          if (origin !== undefined && canonicalDigest(origin) !== canonicalDigest(value))
            throw new Error('The original invocation changed during qualification')
          origin = structuredClone(value)
        }
        const verdict = await guardOf(recorded.observe, observeOrigin).verify({
          principal,
          tenant: request.tenant,
          call: request.call,
          operation: request.admission,
          request: request.request,
        })
        if (verdict.kind === 'denied' || verdict.kind === 'forged')
          return fail({ kind: 'denied', action: 'admit' })
        if (verdict.kind !== 'trusted' || origin === undefined) return unavailable()
        const records = recorded.values()
        if (records.length < 1 || records.length > 3) return unavailable()
        return succeed({ version: 1, request, origin, records })
      } catch {
        return unavailable()
      }
    },
  }
}
function unavailable(): ReplyResult {
  return fail({
    kind: 'unavailable',
    dependency: 'invocation-source',
    diagnostic: 'The original invocation source cannot be qualified.',
  })
}
type ReplyResult = Awaited<Reply<InvocationQualification>>
