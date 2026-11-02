// 会话存储组合的声明（装配页「组合登记」，session-storage-sql `docs/cordis.md`「应用承担什么」）：参加者清单与清单摘要。
// 参加者的目标形状是 `[execution-record, session]`（#978 评论 6562071029，L-RUN P5 第 (c) 项）。基线上没有
// `execution-record` 的材料，而提供者按目录核对参加者（sql-contract §6.2 第 5 步），所以本波只登记有材料的参加者。
// 待替换：L-RUN 交付 `@omne-harness/session-storage-sql/participants` 与 `execution-record` 的材料后，改这一个常量
// 并换一个 `combinationVersion`。
import { SESSION_PARTICIPANT } from '@omne-harness/session-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'

export const SESSION_COMPOSITE_PARTICIPANTS: readonly string[] = [SESSION_PARTICIPANT]

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
