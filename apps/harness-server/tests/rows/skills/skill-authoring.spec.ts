import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extensionsCommandNames } from '@omne-harness/assets-tools'
import {
  DESCRIPTION_LIMIT,
  INSPECT_REJECTIONS,
  SKILL_NAME_LIMIT,
  SKILL_PACKAGE_LIMITS,
  SPECIFICATION_DESCRIPTION_LIMIT,
  skillCategoryDisplay,
} from '@omne-harness/skill-contract'
import { OFFICIAL_SKILLS } from '@omne-harness/skill-host-local'
import { skillsCommandNames } from '@omne-harness/tool-definitions'

const META = 'skill-authoring'
const REPOSITORY = join(import.meta.dirname, '../../../../..')

function filesUnder(root: string): readonly string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
}

const meta = OFFICIAL_SKILLS.find(skill => skill.name === META)
if (meta === undefined) throw new Error('the Skill member brings no meta skill')
const pages = filesUnder(meta.directory).map(path => readFileSync(path, 'utf8'))
const checklist = skillCategoryDisplay.authoring ?? ''
const said = [...pages, checklist].join('\n')

const named = (tool: string) =>
  [...said.matchAll(new RegExp(`\`${tool} ([a-z_]+)\``, 'gu'))].map(match => match[1])

describe('the meta skill says only what is true of the system', () => {
  it('every command it names in code is a command of that tool', () => {
    const extensions = named('OmneExtensions')
    const skills = named('Skills')
    expect(new Set(extensions)).toEqual(new Set(['help', 'impact', 'publish', 'result', 'export']))
    expect(new Set(skills)).toEqual(new Set(['search', 'read', 'read_file']))
    for (const command of extensions) expect(extensionsCommandNames).toContain(command)
    for (const command of skills) expect(skillsCommandNames).toContain(command)
  })

  it('every limit it states is the constant of the contract', () => {
    const mib = (bytes: number) => `${String(bytes / 1024 / 1024)} MiB`
    expect(said).toContain(`${String(SKILL_PACKAGE_LIMITS.files)} files`)
    expect(said).toContain(`${mib(SKILL_PACKAGE_LIMITS.fileBytes)} in one file`)
    expect(said).toContain(`${mib(SKILL_PACKAGE_LIMITS.totalBytes)} in all`)
    expect(said).toContain(`1 to ${String(SKILL_NAME_LIMIT)} characters`)
    expect(said).toContain(`1 to ${String(DESCRIPTION_LIMIT)} characters`)
    expect(said).toContain(`under ${String(SPECIFICATION_DESCRIPTION_LIMIT)} characters`)
    const stated = [...said.matchAll(/\b(\d+) (?:files|characters|MiB)\b/gu)].map(match =>
      Number(match[1]),
    )
    const known = [
      SKILL_PACKAGE_LIMITS.files,
      SKILL_PACKAGE_LIMITS.fileBytes / 1024 / 1024,
      SKILL_PACKAGE_LIMITS.totalBytes / 1024 / 1024,
      SKILL_NAME_LIMIT,
      DESCRIPTION_LIMIT,
      SPECIFICATION_DESCRIPTION_LIMIT,
    ]
    for (const number of stated) expect(known).toContain(number)
  })

  it('every refusal code it explains is a code a publish can give', () => {
    const format = readFileSync(join(meta.directory, 'references/format.md'), 'utf8')
    const table = format.slice(format.indexOf('## Refusals'))
    const codes = [...table.matchAll(/^\| `([a-z-]+)` \|/gmu)].map(match => match[1])
    const known = [...INSPECT_REJECTIONS, 'bad-path', 'irreplaceable-official']
    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) expect(known).toContain(code)
    for (const code of INSPECT_REJECTIONS) expect(codes).toContain(code)
  })

  it('the checklist of the Skill category is at most eight lines and ends by naming the meta skill', () => {
    const lines = checklist.split('\n')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(8)
    expect(lines.at(-1)).toContain(META)
  })

  it('no source names the meta skill but the list that brings it and the checklist that points to it', () => {
    const sources = ['packages', 'apps']
      .flatMap(top =>
        readdirSync(join(REPOSITORY, top), { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .flatMap(entry => {
            const group = join(REPOSITORY, top, entry.name)
            return top === 'apps'
              ? [join(group, 'src')]
              : readdirSync(group, { withFileTypes: true })
                  .filter(member => member.isDirectory())
                  .map(member => join(group, member.name, 'src'))
          }),
      )
      .flatMap(src => {
        try {
          return filesUnder(src)
        } catch {
          return []
        }
      })
      .filter(path => /\.(?:ts|tsx|mts|js|mjs)$/u.test(path))
    const naming = sources
      .filter(path => readFileSync(path, 'utf8').includes(META))
      .map(path => relative(REPOSITORY, path))
    expect(naming.sort()).toEqual([
      'packages/skills/skill-contract/src/contract.ts',
      'packages/skills/skill-host-local/src/official-skills.ts',
    ])
  })
})
