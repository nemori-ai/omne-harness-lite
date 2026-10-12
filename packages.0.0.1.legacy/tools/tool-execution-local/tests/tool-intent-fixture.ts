import { captureToolJournalValue } from '@omne-harness-lite/tool-execution-runtime'
import { ref, request } from './execution-owner-fixture.ts'

export function journalIntent() {
  const captured = captureToolJournalValue({
    revision: 1,
    kind: 'execution_intended',
    ref,
    origin: request.origin,
    input: { parameter: 'captured' },
  })
  if ('invalid' in captured) throw new Error('invalid original journal intent')
  return captured
}
