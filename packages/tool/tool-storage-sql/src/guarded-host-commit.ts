import type { ContentBlock } from '@omne-harness/content-block'
import type { LedgerCommit, LedgerCommitInput, LedgerDomain } from '@omne-harness/tool'
import type { ToolRevision } from '@omne-harness/tool-contract'
import { NotJsonError } from './json.ts'
import { addressOf, ledgerAnswer, unavailable, writesOf, type CommitAnswer } from './ledger-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant, tenantText } from './tenant.ts'
import type { GuardedHostFacts, LedgerWriteFact } from './worker/facts.ts'
import { isObject } from './worker/support.ts'

export type SqlToolGuardedHostCommitInput<B extends ContentBlock> = Readonly<{
  call: Extract<LedgerDomain, { kind: 'call' }>
  callExpected: ToolRevision
  hostCommit: LedgerCommitInput<B>
}>

export type SqlToolGuardedHostCommitResult = LedgerCommit | Readonly<{ kind: 'call-changed' }>

export type SqlToolGuardedHostCommit<B extends ContentBlock> = Readonly<{
  commit(input: SqlToolGuardedHostCommitInput<B>): Promise<SqlToolGuardedHostCommitResult>
}>

function guardedAnswer(answer: CommitAnswer): SqlToolGuardedHostCommitResult {
  if (answer.kind === 'rolled_back') {
    const reply = answer.responses[answer.responses.length - 1]?.reply
    if (
      reply?.kind === 'conflict' &&
      isObject(reply.basis) &&
      reply.basis['reason'] === 'call-changed'
    )
      return { kind: 'call-changed' }
  }
  return ledgerAnswer(answer)
}

/**
 * The caller checks the live call snapshot before committing. This condition and the host CAS
 * run in one SQL transaction. A conflict requires a fresh call read and eligibility check.
 */
export function createSqlToolGuardedHostCommit<B extends ContentBlock = ContentBlock>(
  options: SqlToolStorageOptions,
): SqlToolGuardedHostCommit<B> {
  return {
    commit: async input => {
      const host = input.hostCommit
      if (input.call.kind !== 'call' || host.domain.kind !== 'host')
        return unavailable('guarded host commit requires a call and a host domain')
      const resolved = await resolveTenant(options, host.domain.tenant)
      if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
      const tenant = tenantText(input.call.tenant)
      if (tenant !== resolved.at.tenant)
        return unavailable('guarded host commit requires the same tenant')
      let writes: readonly LedgerWriteFact[]
      try {
        writes = writesOf(host)
      } catch (error) {
        if (error instanceof NotJsonError) return unavailable(error.message)
        throw error
      }
      const facts: GuardedHostFacts = {
        intent: 'guarded-host',
        call: addressOf(tenant, input.call),
        callExpected: input.callExpected,
        hostCommit: {
          ...addressOf(tenant, host.domain),
          intent: 'ledger',
          expected: host.expected,
          revision: host.revision,
          writes,
        },
      }
      return guardedAnswer(await options.storage.commit(requestOf(options, resolved.at, facts)))
    },
  }
}
