import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type {
  ToolActionHistoryOperations,
  ToolAdmissionOperations,
  ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'
import type { AdmissionJudgmentDependencies } from './judgment.ts'
import { createPassBindings } from './pass-bindings.ts'
import { createTokenVerifier } from './verify-token.ts'

export interface ToolAdmissionOptions {
  readonly access: SessionAccessOperations
  readonly backing: SessionLogBackingOperations
  readonly source: ToolAdmissionPassSourceOperations
  readonly history: ToolActionHistoryOperations
  readonly judgment?: AdmissionJudgmentDependencies
}
/** Holds one physical log borrow. It never publishes that borrow to callers or tool implementations. */
export function createToolAdmission(
  options: ToolAdmissionOptions,
): ToolAdmissionOperations & { readonly close: () => Promise<void> } {
  const generation = options.backing.ownerGeneration
  if (!('ok' in parseOpaqueIdentifier(generation, 'LogGeneration')))
    throw new TypeError('Invalid log owner generation')
  const authority: SessionAccessOperations = {
    async authorize(...args) {
      if (options.backing.ownerGeneration !== generation)
        return { kind: 'rejected', reason: 'ownerStopped' }
      const result = await options.access.authorize(...args)
      return options.backing.ownerGeneration === generation
        ? result
        : { kind: 'rejected', reason: 'ownerStopped' }
    },
  }
  const bindings = createPassBindings({
    access: authority,
    source: options.source,
    ...(options.judgment === undefined ? {} : { judgment: options.judgment }),
  })
  const borrow = options.backing.borrow()
  const verifier = createTokenVerifier({
    access: options.access,
    history: options.history,
    backing: options.backing,
    generation,
    log: borrow.log,
  })
  let closing: Promise<void> | undefined,
    released = false
  return Object.freeze({
    forPass: bindings.forPass,
    verifyToken: verifier.verifyToken,
    close() {
      if (released) return Promise.resolve()
      // Both admission gates close synchronously, before awaiting either drain.
      const judgments = bindings.close(),
        reads = verifier.close()
      closing ??= Promise.all([judgments, reads])
        .then(async () => {
          await borrow.release()
          released = true
        })
        .finally(() => {
          closing = undefined
        })
      return closing
    },
  })
}
