// `session` 参加者读的索引表归 `execution-record` 所有，两者必须同在一个组合里，否则提供者核对参加者时
// 报 `read_table_unowned`。
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
