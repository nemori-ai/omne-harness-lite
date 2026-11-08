import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, pageToolResult } from '@omne-harness/tool'
import { resolveToolInvocationRef, type ToolInvocationQueries } from '@omne-harness/tool-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { judgeCommittedToolResult, judgeHandoff } from '@omne-harness/tool-contract/provider'
import type { LocalInvocationSourceInput } from './invocation-source.ts'
import {
  createInvocationForwarding,
  isObject,
  sourceKey,
  TOOL_FORWARDING_OWNER,
} from './invocation-forwarding.ts'

const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'forwarded-result',
    diagnostic: 'The saved forwarding result cannot be verified.',
  })
const denied = () => fail({ kind: 'denied' as const, action: 'read-result' as const })
const missing = () =>
  fail({ kind: 'not-found' as const, target: 'result' as const, reason: 'missing' as const })

export function createForwardedResultReader<P>(
  input: LocalInvocationSourceInput<P>,
  forwarding: ReturnType<typeof createInvocationForwarding<P>>,
): ToolInvocationQueries<P, ContentBlock>['readResult'] {
  const provided = input.forwarding?.results
  const config = provided === undefined ? undefined : { ...provided }
  if (config !== undefined && (!Number.isSafeInteger(config.pageBytes) || config.pageBytes <= 0))
    throw new TypeError('forwarding.results.pageBytes: range')
  return async given => {
    if (config === undefined) return unavailable()
    const access = { ...given }
    const reference = resolveToolInvocationRef(access.reference, access.tenant)
    if ('failure' in reference) return denied()
    const address = {
      principal: access.principal,
      tenant: access.tenant,
      call: reference.ok.call,
      action: 'read-result' as const,
    }
    const qualify = async () => {
      const answer = await config.access.qualify(address)
      return answer.kind === 'allowed'
        ? succeed(undefined)
        : answer.kind === 'denied'
          ? denied()
          : unavailable()
    }
    try {
      const allowed = await qualify()
      if ('failure' in allowed) return allowed
      const read = await input.store.read({
        kind: 'call',
        tenant: address.tenant,
        call: address.call,
      })
      if (read.kind !== 'complete') return unavailable()
      const call = read.records.find(row => row.kind === 'call')
      const result = read.records.find(
        row => row.kind === 'result' && row.result.result === access.result,
      )
      if (call?.kind !== 'call' || result?.kind !== 'result') return missing()
      if (call.call.admission !== reference.ok.admission) return denied()
      const record = result.result
      const consumer = record.delivery.consumer
      if (consumer.owner !== TOOL_FORWARDING_OWNER) return missing()
      const found = await forwarding.storedOf(access, consumer)
      if ('failure' in found) return found
      if (found.ok.stored === null) return missing()
      const stored = found.ok.stored
      if (stored.call !== reference.ok.call || stored.admission !== reference.ok.admission)
        return denied()
      const verified = await forwarding.verifyStored(access, stored)
      if ('failure' in verified) return verified
      if (!Array.isArray(stored.raw.received)) return unavailable()
      const key = {
        kind: 'result' as const,
        producer: 'tool' as const,
        reference: access.reference,
        result: access.result,
      }
      const keyDigest = canonicalDigest(key)
      const received: unknown = stored.raw.received.find(
        (item: unknown) => isObject(item) && canonicalDigest(item.key) === keyDigest,
      )
      if (received === undefined) return missing()
      if (!isObject(received) || !isObject(received.payload)) return unavailable()
      const value = judgeCommittedToolResult(config.policy, received.payload.value)
      if ('failure' in value) return unavailable()
      const page = {
        result: record.result,
        terminal: record.terminal,
        effect: record.effect,
        actualTerminal: record.actual,
        relation: record.relation,
        delivery: record.delivery.delivery,
        source: record.source,
        value: value.ok,
      }
      const { result: _, ...delivery } = page
      const payload = {
        kind: 'result',
        key,
        consumer,
        ...delivery,
        account: received.payload.account,
      }
      const digest = canonicalDigest(payload)
      const handoff = judgeHandoff({ kind: 'retained', custody: received.evidence })
      if (
        canonicalDigest(received.payload) !== digest ||
        received.digest !== digest ||
        'failure' in handoff ||
        handoff.ok.kind !== 'retained' ||
        handoff.ok.custody.owner !== TOOL_FORWARDING_OWNER ||
        handoff.ok.custody.record !== `${sourceKey(consumer)}/delivery/${keyDigest}` ||
        handoff.ok.custody.digest !== digest
      )
        return unavailable()
      const current = await forwarding.verifyStored(access, stored)
      if ('failure' in current) return current
      const qualified = await qualify()
      return 'failure' in qualified
        ? qualified
        : pageToolResult(
            {
              ...address,
              after: access.after,
              pageBytes: config.pageBytes,
              adoption: config.policy.adoption,
            },
            page,
          )
    } catch {
      return unavailable()
    }
  }
}
