import schema from '@omne-harness-lite/skill-package/schema' with { type: 'json' }
import type { BodyContract, BodyJudgeContext } from '@omne-harness-lite/asset-model'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'
import { isSkillPackage, judgeSkillPackage } from './judge.ts'
import { skillAttributeDeclarations, skillReferences } from './declarations.ts'
import { SCHEMA_DEF_NAMES, validate } from './schema.ts'

const capturedSchema = copyJson(schema)
if (!object(capturedSchema)) throw new Error('Skill Schema is not an object')
export const skillBodyContract: BodyContract<'skill'> = Object.freeze({
  category: 'skill',
  schema: capturedSchema,
  judge(body: unknown, context?: BodyJudgeContext) {
    if (context?.definition !== undefined && context.definition !== 'SkillPackage') {
      const definition = SCHEMA_DEF_NAMES.find(name => name === context.definition)
      if (definition === undefined) throw new TypeError('unknown Skill Schema definition')
      return validate(definition, body).valid
        ? Object.freeze({ ok: true })
        : Object.freeze({ rejected: 'malformed' })
    }
    return judgeSkillPackage(body, context)
  },
  deriveDeclarations(body: JsonValue) {
    if (!isSkillPackage(body)) throw new TypeError('valid SkillPackage required')
    return Object.freeze({ declarations: skillAttributeDeclarations(body) })
  },
  references(body: JsonValue) {
    if (!isSkillPackage(body)) throw new TypeError('valid SkillPackage required')
    return skillReferences(body)
  },
})
