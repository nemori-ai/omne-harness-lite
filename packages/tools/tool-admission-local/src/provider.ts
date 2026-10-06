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
export function createToolAdmission(options: ToolAdmissionOptions): ToolAdmissionOperations & {
  readonly closeAdmission: () => Promise<void>
  readonly close: () => Promise<void>
} {
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
  function closeAdmission(): Promise<void> {
    // Qualification ends synchronously; the stable owner still holds the physical borrow.
    const judgments = bindings.close(),
      reads = verifier.close()
    return Promise.all([judgments, reads]).then(() => undefined)
  }
  let closing: Promise<void> | undefined,
    released = false
  return Object.freeze({
    forPass: bindings.forPass,
    verifyToken: verifier.verifyToken,
    closeAdmission,
    close() {
      if (released) return Promise.resolve()
      closing ??= closeAdmission()
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
