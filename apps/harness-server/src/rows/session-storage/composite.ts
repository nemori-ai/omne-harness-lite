// 会话存储组合的声明（装配页「组合登记」，session-storage-sql `docs/cordis.md`「应用承担什么」）：参加者清单与清单摘要。
// 参加者是 `[execution-record, session]`：`session` 参与者读的索引表归 `execution-record` 所有，所以两者必须同在一个
// 组合里，否则提供者按目录核对参加者（sql-contract §6.2 第 5 步）会报 `read_table_unowned`。清单按名字排序，
// 这里的顺序不影响摘要。
import { SESSION_LOG_PARTICIPANTS } from '@omne-harness/session-storage-sql/participants'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'

export const SESSION_COMPOSITE_PARTICIPANTS: readonly string[] = [...SESSION_LOG_PARTICIPANTS]

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
