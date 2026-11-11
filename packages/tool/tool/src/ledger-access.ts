import { fail, succeed } from '@omne-harness/operation-result'
import type { Reply } from '@omne-harness/tool-contract'
import { denied, judgeCallInput, type CallInput } from './boundary.ts'
import type { ToolAccessGuard, ToolLedgerAction } from './ledger-guards.ts'

export function createLedgerAccess<P>(guard: ToolAccessGuard<P>) {
  const access = async (input: CallInput<P>, action: ToolLedgerAction): Reply<void> => {
    let verdict: Awaited<ReturnType<typeof guard.qualify>>
    try {
      verdict = await guard.qualify({ ...input, action })
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'access-guard',
        diagnostic: 'access-guard threw an exception; its message is not reported',
      })
    }
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'denied') return denied(action)
    return fail({ kind: 'unavailable', dependency: 'access-guard', diagnostic: verdict.diagnostic })
  }
  const entry = async (input: unknown, action: ToolLedgerAction): Reply<CallInput<P>> => {
    const checked = judgeCallInput<P>(input, action)
    if ('failure' in checked) return checked
    const allowed = await access(checked.ok, action)
    return 'failure' in allowed ? allowed : checked
  }
  return { access, entry }
}
