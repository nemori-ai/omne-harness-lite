import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { OFFICIAL_SKILLS } from '@omne-harness/plugin-host-local'
import { skillBodyContract } from '@omne-harness/skill-contract'
import { OFFICIAL_SKILLS as SKILL_SKILLS } from '@omne-harness/skill-host-local'
import { officialSkillPorts, officialSkills } from '../../../src/rows/skills/official-skills.ts'

const made: string[] = []
afterEach(async () => {
  for (const path of made.splice(0)) await rm(path, { recursive: true, force: true })
})

async function directoryWith(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'official-skills-')))
  made.push(root)
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), text)
  }
  return root
}

describe('the skills the release brings', () => {
  it('each is read as its category judges a package: an official item whose version is the digest of its files, a body, and its files', async () => {
    const [skill] = await officialSkills(OFFICIAL_SKILLS)
    expect(skill?.name).toBe('skin-authoring')
    expect(skill?.item).toMatchObject({
      asset: 'official/skill/skin-authoring',
      disabled: false,
      immutable: false,
    })
    expect(skill?.item.version).toMatch(/^sha256:[0-9a-f]{64}$/u)
    const summary = skillBodyContract().summarize?.(skill!.body, {
      capabilityName: 'skin-authoring',
      definition: skill!.item.version,
    })
    expect(summary).toMatchObject({ title: 'skin-authoring' })
    const listed = await skill!.files.manifest()
    if (!('ok' in listed)) throw new Error(listed.failure)
    expect(listed.ok.entries.map(entry => entry.path)).toEqual(['SKILL.md'])
  })

  it('the meta skill of the Skill member is read the same way and is held where no tenant may replace it', async () => {
    const [skill] = await officialSkills(SKILL_SKILLS)
    expect(skill?.name).toBe('skill-authoring')
    expect(skill?.item).toMatchObject({
      asset: 'official/skill/skill-authoring',
      disabled: false,
      immutable: true,
    })
    const listed = await skill!.files.manifest()
    if (!('ok' in listed)) throw new Error(listed.failure)
    expect(listed.ok.entries.map(entry => entry.path)).toEqual([
      'SKILL.md',
      'references/format.md',
      'references/trying.md',
      'references/writing.md',
    ])
  })

  it('one that cannot be read as a skill stops the start, naming it', async () => {
    const directory = await directoryWith({ 'README.md': 'not a skill\n' })
    await expect(officialSkills([{ name: 'broken', directory }])).rejects.toThrow(
      `the official skill broken in ${directory} cannot be read as a skill`,
    )
  })

  it('the Skill row finds the directory of a version it brought, and of no other version or asset', async () => {
    const brought = await officialSkills(OFFICIAL_SKILLS)
    const [skill] = brought
    const ports = officialSkillPorts(brought, () => [])
    expect(ports.directoryOf('official/skill/skin-authoring', skill!.item.version)).toBe(
      skill!.directory,
    )
    expect(ports.directoryOf('official/skill/skin-authoring', 'sha256:0')).toBeUndefined()
    expect(ports.directoryOf('official/skill/other', skill!.item.version)).toBeUndefined()
  })
})
