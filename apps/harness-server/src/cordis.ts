// `./cordis` 导出：S0 替身插件与真实行（单写点，L1-06）。导出名就是发行配置里 `plugin` 的取值，也是装载的 allowlist。
// 两个工厂行不在这里：`executionHost` 与 `telemetry` 按每次运行绑定，由 `run.ts` 加进 allowlist（见各自的行目录）。
import { releaseToolRequestsOf } from './entry/tool-requests.ts'
import { createAgentHostRow } from './rows/agent-host/index.ts'
export { createStubPlugin as stubPlugin } from './s0/stub-plugin.ts'
export { agentAdoptionsRow } from './rows/agent-adoptions/index.ts'
export { adoptionSourcesRow } from './rows/adoption-sources/index.ts'
export { authorization } from './rows/authorization/row.ts'
export { identityRow } from './rows/identity/index.ts'
export { governanceRow } from './rows/governance/index.ts'
export { serverEntryRow } from './rows/server-entry/index.ts'
export { storageRow } from './rows/storage/index.ts'
export { sessionStorageRow } from './rows/session-storage/index.ts'
export { agentModelSelectionRow } from './rows/agent-model-selection/index.ts'
export { modelInstancesRow } from './rows/model-instances/index.ts'
export { modelConvertersRow } from './rows/model-converters/index.ts'
export { modelProfilesRow } from './rows/model-profiles/index.ts'
export { modelRequestPreparationRow } from './rows/model-request-preparation/index.ts'
export { modelCredentialRow } from './rows/model-credential/index.ts'
export { secretCustodyRow } from './rows/secret-custody/index.ts'
export { settingsRow } from './rows/settings/index.ts'
export { modelRecordsRow } from './rows/model-records/index.ts'
export { modelHostRow } from './rows/model-host/index.ts'
export { sessionProviderRow } from './rows/session-provider/index.ts'
export { sessionAd06Row } from './rows/session-ad06/index.ts'
export { sessionAd09Row } from './rows/session-ad09/index.ts'
export { sessionAd10Row } from './rows/session-ad10/index.ts'
export { sessionAd12Row } from './rows/session-ad12/index.ts'
export { sessionAd14Row } from './rows/session-ad14/index.ts'
export { agentJournalRow } from './rows/agent-journal/index.ts'
export { agentInstancesRow } from './rows/agent-instances/index.ts'
export { agentAccountOutletRow } from './rows/agent-account-outlet/index.ts'
export { runtimeContextRow } from './rows/runtime-context/index.ts'
export { toolBindingsRow } from './rows/tool-bindings/index.ts'
export { toolHostRow } from './rows/tool-host/index.ts'
export { toolResidencyRow } from './rows/tool-residency/index.ts'
export {
  toolEnvironmentsRow,
  toolExecutorRow,
  toolInstancesRow,
  toolRecordsRow,
  toolRuntimeRow,
} from './rows/tool-runtime/index.ts'
export {
  executionCommandRow,
  executionEnvironmentRow,
  executionFilesRow,
} from './rows/execution-environment/index.ts'
export { requestContextRow } from './rows/request-context/index.ts'
export { agentContextRow } from './rows/agent-context/index.ts'
export { sessionAd02Row } from './rows/session-ad02/index.ts'
export { sessionAd03Row } from './rows/session-ad03/index.ts'
export { sessionAd04Row } from './rows/session-ad04/index.ts'
export { sessionAd05Row } from './rows/session-ad05/index.ts'
export { sessionHandoffRow } from './rows/session-handoff/index.ts'
export { sessionConditionsRow } from './rows/session-conditions/index.ts'

// 发行的 `agent-host` 行交入 Tool 请求来源的生产组合（Tool B 段，R2-D36 第 3 点、R2-D185）。`measure` 不在这里交入：
// 行自己在注入的 `telemetry` 上构造 Agent 遥测 facade（#1140 C8）。导出名仍是 `agentHostRow`。
export const agentHostRow = createAgentHostRow({ toolRequestsOf: releaseToolRequestsOf })

export { modelTokenizersRow } from './rows/model-tokenizers/index.ts'
