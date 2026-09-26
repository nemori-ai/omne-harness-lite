/** Exact Skill2 pure values/body for the currently adopted AM3/AE3/Slash2 contracts. */
export type {
  SkillName,
  SkillManifest,
  ResourceEntry,
  SkillSetting,
  ToolReference,
  SkillDefinitionRecord,
  SkillPackage,
  SkillRejection,
  MalformedCode,
  SkillJudgment,
  SkillJudgeContext,
  SkillDependency,
} from './types.ts'
export { SCHEMA_DEF_NAMES, type SchemaDefName } from './schema.ts'
export { skillAttributeDeclarations, skillReferences } from './declarations.ts'
export { skillDependencies } from './dependencies.ts'
export { skillScripts } from './scripts.ts'
import { skillV2SchemaBinding } from './schema.ts'
import { createSkillJudge } from './judge.ts'
import { createSkillBodyContract } from './body.ts'
import type { SkillPackage } from './types.ts'

export const schemaId = skillV2SchemaBinding.schemaId
export const validate = skillV2SchemaBinding.validate
export const judgeSkillPackage = createSkillJudge(skillV2SchemaBinding)
export function isSkillPackage(value: unknown): value is SkillPackage {
  return 'ok' in judgeSkillPackage(value)
}
export const skillBodyContract = createSkillBodyContract(skillV2SchemaBinding, judgeSkillPackage)
