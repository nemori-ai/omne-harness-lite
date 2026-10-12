import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'

/** Model-position fixtures do not grant permission to read an action pass. */
export class DeniedAccess extends SessionAccessService {
  async authorize() {
    return { kind: 'rejected', reason: 'notAuthorized' } as const
  }
}
