import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  sessionDiagnosticsProtocol,
  type SessionDiagnosticsProtocol,
} from '@omne-harness/session-diagnostics-protocol'
import { serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { diagnosticsReads, type BlockReadsSource } from './model/block-reads.ts'

const DIAGNOSTICS = protocolServiceName({
  name: sessionDiagnosticsProtocol.name,
  major: sessionDiagnosticsProtocol.major,
})

/** Where the reads of the blocks are offered, while the session diagnostics are open to this client. */
export const sessionReadsSourceKey = serviceKey<BlockReadsSource>('session.block-reads-source')

export const sessionReadsUiModule = defineUiModule<
  Record<string, ClientOf<SessionDiagnosticsProtocol>>
>({
  name: 'session-reads-ui',
  inject: [DIAGNOSTICS],
  apply(_shell, services, provide) {
    provide(sessionReadsSourceKey, diagnosticsReads(services[DIAGNOSTICS]!))
  },
})
