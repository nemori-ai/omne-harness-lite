import { checkSourceToken, type SessionLog } from '@omne-harness-lite/session-log'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
/** In-memory unit-test journal identity, supplied explicitly. Not durable SQL provenance. */
export function mockPrefixReader(
  journalGeneration: string,
): NonNullable<SettlementLogBinding['readPrefix']> {
  return async function (this: SettlementLogBinding) {
    const read = await this.log.readSince(this.session, 0)
    if ('failure' in read) return { failure: 'unavailable' }
    const checked = checkSourceToken({
      tenant: this.tenant,
      session: this.session,
      journalGeneration,
      tail: read.tail,
    })
    if ('failure' in checked) throw new Error('mock journal source')
    return { ...read, source: checked.ok }
  }
}
