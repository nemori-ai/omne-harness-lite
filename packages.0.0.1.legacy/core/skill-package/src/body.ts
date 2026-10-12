import type { BodyContract, BodyJudgeContext } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { judgeSkillPackage } from './judge.ts'
import { skillAttributeDeclarations, skillReferences } from './declarations.ts'
import { SCHEMA_DEF_NAMES, skillSchemaBinding, type SkillSchemaBinding } from './schema.ts'
import type { SkillJudgeContext, SkillJudgment, SkillPackage } from './types.ts'

export function createSkillBodyContract(
  binding: SkillSchemaBinding,
  judge: (body: unknown, context?: SkillJudgeContext) => SkillJudgment,
): BodyContract<'skill'> {
  function valid(body: unknown): body is SkillPackage {
    return 'ok' in judge(body)
  }
  function checked(body: JsonValue): SkillPackage {
    if (!valid(body)) throw new TypeError('valid SkillPackage required')
    return body
  }
  return Object.freeze({
    category: 'skill',
    schema: binding.schema,
    judge(body: unknown, context?: BodyJudgeContext) {
      if (context?.definition !== undefined && context.definition !== 'SkillPackage') {
        const definition = SCHEMA_DEF_NAMES.find(name => name === context.definition)
        if (definition === undefined) throw new TypeError('unknown Skill Schema definition')
        return binding.validate(definition, body).valid
          ? Object.freeze({ ok: true })
          : Object.freeze({ rejected: 'malformed' })
      }
      return judge(body, context)
    },
    deriveDeclarations(body: JsonValue) {
      return Object.freeze({ declarations: skillAttributeDeclarations(checked(body)) })
    },
    references(body: JsonValue) {
      return skillReferences(checked(body))
    },
  })
}
export const skillBodyContract = createSkillBodyContract(skillSchemaBinding, judgeSkillPackage)
