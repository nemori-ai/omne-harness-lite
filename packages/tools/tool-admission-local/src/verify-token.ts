import { copyJsonValue, judgeContentBlock } from '@omne-harness-lite/content-blocks'
import {
  admissionArgumentDigest,
  decodeRunnerAdmissionToken,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionLog, SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  ToolActionHistoryOperations,
  ToolAdmissionOperations,
} from '@omne-harness-lite/tool-admission'
import { ownScope } from './scope.ts'
import { captureVerificationPrefix } from './verification-prefix.ts'
import { verifyFacts } from './verify-facts.ts'

const failed = (reason: 'invalidInput' | 'notAuthorized' | 'unavailable') =>
  ({ kind: 'failed', reason }) as const

export function createTokenVerifier(dependencies: {
  readonly access: SessionAccessOperations
  readonly backing: SessionLogBackingOperations
  readonly generation: string
  readonly log: SessionLog
  readonly history: ToolActionHistoryOperations
}): Pick<ToolAdmissionOperations, 'verifyToken'> & { readonly close: () => Promise<void> } {
  const { access: authority, backing, generation, log, history } = dependencies
  let active = true
  const pending = new Set<Promise<unknown>>()
  const current = () => active && backing.ownerGeneration === generation
  async function authorize(access: SessionAccess, scope: SessionScope) {
    if (!current()) return failed('unavailable')
    const result = await authority.authorize(access, scope, 'tool.submit')
    if (!current()) return failed('unavailable')
    return result.kind === 'authorized'
      ? result
      : failed(result.reason === 'ownerStopped' ? 'unavailable' : result.reason)
  }
  const verifyToken: ToolAdmissionOperations['verifyToken'] = (
    access,
    scopeInput,
    token,
    callInput,
  ) => {
    if (!active) return Promise.resolve(failed('unavailable'))
    const scope = ownScope(scopeInput),
      copied = copyJsonValue(callInput),
      locator = decodeRunnerAdmissionToken(token)
    if (scope === undefined || 'failed' in copied || 'invalidInput' in locator)
      return Promise.resolve(failed('invalidInput'))
    const judged = judgeContentBlock(copied.ok)
    if (
      !('ok' in judged) ||
      judged.ok.kind !== 'tool_call' ||
      judged.ok.complete !== true ||
      judged.ok.unparseable === true
    )
      return Promise.resolve(failed('invalidInput'))
    const call = judged.ok
    const work = Promise.resolve().then(async () => {
      try {
        const before = await authorize(access, scope)
        if (before.kind === 'failed') return before
        if (locator.callId !== call.callId)
          return { kind: 'invalid', reason: 'call_mismatch' } as const
        if (admissionArgumentDigest(call.arguments) !== locator.argumentDigest)
          return { kind: 'invalid', reason: 'arguments_changed' } as const
        const raw = await log.readSince(scope.session, 0)
        const after = await authorize(access, scope)
        if (after.kind === 'failed') return after
        const prefix = captureVerificationPrefix(scope, generation, raw)
        if (prefix === undefined) return failed('unavailable')
        const result = verifyFacts(prefix, locator, call, history)
        return current() ? result : failed('unavailable')
      } catch {
        return failed('unavailable')
      }
    })
    pending.add(work)
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work),
    )
    return work
  }
  return Object.freeze({
    verifyToken,
    async close() {
      active = false
      while (pending.size !== 0) await Promise.allSettled([...pending])
    },
  })
}
