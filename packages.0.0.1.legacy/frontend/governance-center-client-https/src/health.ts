import type { PublicHealthOptions } from '@omne-harness-lite/governance-center-entry-https-json'
import { PUBLIC_HEALTH_BODY, decodeHealthReply } from './protocol.ts'
import { type PublicHealthOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { sendRequest } from './transport.ts'

/** D038: the original EC1/HT1 public-health decoder remains independent. */
export async function readPublicHealth(options: PublicHealthOptions): Promise<PublicHealthOutcome> {
  const result = await sendRequest(options, PUBLIC_HEALTH_BODY)
  return result.kind === 'response'
    ? decodeHealthReply(result.body, result.status)
    : { kind: 'unavailable', reason: result.reason }
}
