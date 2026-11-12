// 会话存储组合的声明（装配页「组合登记」，session-storage-sql `docs/cordis.md`「应用承担什么」）：参加者清单与清单摘要。
// 参加者是 `[execution-record, session-ordinary-basis, session]` 加 `model`：`session` 参与者读的索引表归 `execution-record` 所有，所以两者必须
// 同在一个组合里，否则提供者按目录核对参加者（sql-contract §6.2 第 5 步）会报 `read_table_unowned`；Model 的耐久记录仓
// 与会话日志同一事务域（装配页「租户到事务域的目录」、R2-D6），所以 `model` 参加者并入同一组合，`model-records` 行以
// 同一个 `combinationVersion` 与本函数算出的同一摘要提交。Tool 的耐久记录仓（`tool` 参加者）在 B 段同样并入，`tool-records`
// 行以同一版本与摘要提交。Tool 的 Ask 等待由 HITL 保管（`rows/tool-hitl`）：HITL 的参加者与 Session 的只读守卫
// `session.run-live` 也并入，守卫与 HITL 的登记和答复在同一笔提交里成立。清单按名字排序（摘要不依赖顺序，排序只为可读）。
import {
  hitlSqlMaterials,
  independentWaitSqlMaterials,
} from '@omne-harness/human-intervention-local'
import { MODEL_PARTICIPANT } from '@omne-harness/model-storage-sql'
import {
  SESSION_LOG_PARTICIPANTS,
  SESSION_RUN_LIVE_GUARD,
} from '@omne-harness/session-storage-sql/participants'
import { TOOL_PARTICIPANT } from '@omne-harness/tool-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'

/** HITL 的全部参加者：终态、请求与等待的规划者和写者。 */
const HITL_PARTICIPANTS = [
  ...hitlSqlMaterials().participants,
  ...independentWaitSqlMaterials().participants,
].map(participant => participant.participant)

export const SESSION_COMPOSITE_PARTICIPANTS: readonly string[] = [
  ...SESSION_LOG_PARTICIPANTS,
  MODEL_PARTICIPANT,
  TOOL_PARTICIPANT,
  ...HITL_PARTICIPANTS,
  SESSION_RUN_LIVE_GUARD,
].toSorted()

export type CompositeManifest =
  | Readonly<{ kind: 'manifest'; digest: string }>
  | Readonly<{ kind: 'invalid'; diagnostic: string }>

/** 本构建对会话存储组合算出的清单摘要（sql-contract §4.4）。提供者在登记时按同一算法核对。 */
export function compositeManifestDigest(catalog: SqlMaterialCatalog): CompositeManifest {
  const judged = combinationManifest({ catalog, participants: SESSION_COMPOSITE_PARTICIPANTS })
  switch (judged.kind) {
    case 'manifest':
      return { kind: 'manifest', digest: manifestDigest(judged.manifest) }
    case 'material_unavailable':
      return { kind: 'invalid', diagnostic: `material_unavailable: ${judged.participant}` }
    case 'combination_invalid':
      return {
        kind: 'invalid',
        diagnostic: `combination_invalid: ${judged.problems.map(problem => problem.kind).join(', ')}`,
      }
  }
}
