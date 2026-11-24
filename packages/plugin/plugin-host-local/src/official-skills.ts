import { fileURLToPath } from 'node:url'

/** A skill package this member brings with the release: its name and the directory that holds it. */
export type OfficialSkill = Readonly<{ name: string; directory: string }>

/** The skills the release brings for the categories this member owns: how a skin is written. */
export const OFFICIAL_SKILLS: readonly OfficialSkill[] = Object.freeze([
  Object.freeze({
    name: 'skin-authoring',
    directory: fileURLToPath(new URL('../skills/skin-authoring', import.meta.url)),
  }),
])
