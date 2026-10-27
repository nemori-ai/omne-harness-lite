import { canonical } from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import type { RequestInput, RequestRecord } from './collaboration-records.ts'
import type { VerifiedRecordComment } from './collaboration-trust.ts'

export type RegisteredRequest = {
  input: RequestInput
  receipt: VerifiedRecordComment & { record: RequestRecord }
  transmissions: { commentId: number; runId: number; runAttempt: number }[]
}

export function requestIdentity(input: RequestInput): string {
  return canonical({
    repo: input.context.repo,
    milestone: input.context.milestone,
    wave: input.context.wave,
    lineParent: input.lineParent,
    requestId: input.requestId,
  })
}

/** Deduplicates validated transport receipts. Pending and failed attempts remain outside this input. */
export function registeredRequests(
  comments: readonly VerifiedRecordComment[],
): RegisteredRequest[] {
  const requests = new Map<string, RegisteredRequest>()
  for (const comment of [...comments].sort((a, b) => a.id - b.id)) {
    const { record } = comment
    if (record.kind !== 'request') continue
    const key = requestIdentity(record.input),
      existing = requests.get(key)
    const transmission = {
      commentId: comment.id,
      runId: record.workflow.runId,
      runAttempt: record.workflow.runAttempt,
    }
    if (existing !== undefined) {
      if (canonical(existing.input) !== canonical(record.input))
        throw new InputError('collaboration-request-identity-conflict')
      if (!existing.transmissions.some(item => item.commentId === comment.id))
        existing.transmissions.push(transmission)
      continue
    }
    requests.set(key, {
      input: record.input,
      receipt: { ...comment, record },
      transmissions: [transmission],
    })
  }
  return [...requests.values()]
}
