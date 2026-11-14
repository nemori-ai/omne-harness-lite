import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type { SessionCustodySource, SessionProductionSource } from '@omne-harness/session-contract'
import {
  SessionCustodySourceService,
  SessionProductionSourceService,
  sessionCustodySourceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryObjectModule } from '../types.ts'

const absent = (owner: string, source: string) =>
  fail({
    kind: 'unavailable' as const,
    owner,
    diagnostic: `the assembly entry has no ${source} evidence source; the original owner's row is not delivered`,
  })

class EntryProductionSource extends SessionProductionSourceService {
  readonly prepare: SessionProductionSource['prepare'] = () =>
    Promise.resolve(absent(sessionProductionSourceKey, 'production'))
}

class EntryCustodySource extends SessionCustodySourceService {
  readonly prepare: SessionCustodySource['prepare'] = () =>
    Promise.resolve(absent(sessionCustodySourceKey, 'custody'))
}

export const sessionProductionSource: EntryObjectModule = {
  name: sessionProductionSourceKey,
  implementation: 'real',
  install(scope: Context) {
    new EntryProductionSource(scope)
  },
}

export const sessionCustodySource: EntryObjectModule = {
  name: sessionCustodySourceKey,
  implementation: 'real',
  install(scope: Context) {
    new EntryCustodySource(scope)
  },
}
