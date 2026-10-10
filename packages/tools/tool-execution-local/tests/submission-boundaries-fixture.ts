import { vi } from 'vitest'
import type { ToolActionFacts, ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type { RuntimeJournalView } from '../src/execution-journal.ts'
import { createSubmissionAdmission } from '../src/submission.ts'
import { fixture, ref, scope } from './execution-owner-fixture.ts'

/** Actual initial SQL view; business authorization and official admission remain controlled ports. */
export async function admissionFixture() {
  const f = await fixture()
  const initial = await f.journal.read(scope, ref.callId)
  if (initial.kind !== 'view' || initial.facts === undefined)
    throw new Error('missing original admission fixture view')
  const initialFacts = initial.facts
  let view: RuntimeJournalView = initial
  let open = true
  const authorize = vi.fn(f.authorize)
  const read = vi.fn(async () => view)
  const verifyToken = vi.fn<ToolAdmissionOperations['verifyToken']>(async () => ({
    kind: 'valid',
    checked: { scope, ownerGeneration: view.prefix.ownerGeneration, tail: view.prefix.tail },
  }))
  const original: ToolAdmissionOperations = {
    verifyToken,
    forPass: async () => ({ kind: 'rejected', reason: 'passUnavailable' }),
  }
  let current: ToolAdmissionOperations | undefined = original
  const admission = vi.fn(() => current)
  const check = createSubmissionAdmission({
    authorization: { authorize },
    journal: { read },
    admission,
    isOpen: () => open,
    attempts: 2,
  })
  return {
    check,
    authorize,
    read,
    verifyToken,
    admission,
    get view() {
      return view
    },
    replaceView(replacement: RuntimeJournalView) {
      view = replacement
    },
    replaceFacts(patch: Partial<ToolActionFacts>) {
      view = { ...view, facts: { ...initialFacts, ...patch } }
    },
    withdraw() {
      current = undefined
    },
    stop() {
      open = false
    },
    close: () => f.close(),
  }
}
