import { fileURLToPath } from 'node:url'

/** A Skill package this member brings with the release: its name, the directory that holds it, and whether a tenant may replace it. */
export type OfficialSkill = Readonly<{ name: string; directory: string; irreplaceable: boolean }>

/** The Skills the release brings for the Skill category: how a Skill is written. */
export const OFFICIAL_SKILLS: readonly OfficialSkill[] = Object.freeze([
  Object.freeze({
    name: 'skill-authoring',
    directory: fileURLToPath(new URL('../skills/skill-authoring', import.meta.url)),
    irreplaceable: true,
  }),
])
