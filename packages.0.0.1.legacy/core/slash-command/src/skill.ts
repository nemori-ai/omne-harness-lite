import { judgeContentBlock, type TextBlock } from '@omne-harness-lite/content-blocks'
import {
  isSkillPackage,
  judgeSkillPackage,
  type SkillPackage,
} from '@omne-harness-lite/skill-package/v2'
import { isCommandInvocation } from './judge.ts'
import { snapshot, object } from './json.ts'
import type { CommandInvocation, ExpansionBlockAnnotation } from './types.ts'

/** S-22 pure projection. The caller owns authorization, effective-skill selection and every annotation. */
export function expandSkill(
  invocation: CommandInvocation,
  skillName: string,
  skill: SkillPackage,
  annotations: readonly ExpansionBlockAnnotation[],
): readonly TextBlock[] {
  const capturedInvocation = snapshot(invocation)
  const capturedSkill = snapshot(skill)
  const capturedAnnotations = snapshot(annotations)
  if (
    !isCommandInvocation(capturedInvocation) ||
    !isSkillPackage(capturedSkill) ||
    'rejected' in judgeSkillPackage(capturedSkill, { capabilityName: skillName }) ||
    !Array.isArray(capturedAnnotations)
  )
    throw new TypeError('valid invocation, selected SkillPackage and annotations required')
  const texts =
    capturedInvocation.argumentText === ''
      ? [capturedSkill.body]
      : [capturedSkill.body, capturedInvocation.argumentText]
  if (capturedAnnotations.length !== texts.length)
    throw new TypeError('exactly one caller annotation per expansion block required')
  return Object.freeze(
    texts.map((text, index) => {
      const annotation = capturedAnnotations[index]
      if (!object(annotation)) throw new TypeError('valid block annotation required')
      const judgment = judgeContentBlock({
        kind: 'text',
        id: annotation.id,
        visibility: annotation.visibility,
        text,
        origin:
          index === 0
            ? { kind: 'skill_body', command: capturedInvocation.name, skill: skillName }
            : { kind: 'slash_command_args', command: capturedInvocation.name },
      })
      if ('rejected' in judgment || judgment.ok.kind !== 'text')
        throw new TypeError('valid block identity and visibility required')
      return judgment.ok
    }),
  )
}
