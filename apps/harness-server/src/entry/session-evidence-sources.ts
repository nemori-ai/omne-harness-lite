// 证据桥的两个来源入口对象（装配页缺口表「`session-ad10` 必需的生产来源与保管来源」）：`sessionProductionSource` 与
// `sessionCustodySource` 在根上 provide，`session-ad10` 行静态 inject。原事实拥有者（Journal、Model、Tool、AD-15、材料
// 保管者）的来源行还没有交付；入口没有生产事实与保管事实的来源，所以每次 `prepare` 答 `unavailable`、`owner` 是该键、
// 诊断点名来源，不给任何守卫。`create` 只问采用来源（session-adapters `evidence-bridge.ts` 的 `ADOPTION` 表），所以
// 不受影响；`receive`、`preserveResult`、`completeInitialization`、`completeConsumption`、`completeExternalConsumption`
// 在来源行交付之前如实不可用。不编造证据，也不放行。
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
