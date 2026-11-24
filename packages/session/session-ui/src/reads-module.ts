import type { ClientOf } from '@omne-harness/sdk/core'
import {
  sessionDiagnosticsProtocol,
  type SessionDiagnosticsProtocol,
} from '@omne-harness/session-diagnostics-protocol'
import { needProtocol, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { diagnosticsReads, type BlockReadsSource } from './model/block-reads.ts'

/** Where the reads of the blocks are offered, while the session diagnostics are served. */
export const sessionReadsSourceKey = serviceKey<BlockReadsSource>('session.block-reads-source')

export const sessionReadsUiModule = defineUiModule({
  name: 'session-reads-ui',
  needs: {
    diagnostics: needProtocol<ClientOf<SessionDiagnosticsProtocol>>(sessionDiagnosticsProtocol),
  },
  apply(_shell, { diagnostics }, provide) {
    provide(sessionReadsSourceKey, diagnosticsReads(diagnostics))
  },
})
