import type { OfficialAssets, PackageReader } from '@omne-harness/assets'
import type { BroughtDefinition } from '@omne-harness/assets-cordis-contract/cordis'
import type { OfficialSkill } from '@omne-harness/plugin-host-local'
import { skillBodyContract } from '@omne-harness/skill-contract'
import { createDirectorySource, directoryPackageReader } from '@omne-harness/skill-host-local'
import { officialAssetRef, officialItem } from '../../assets/official-holdings.ts'
import { packageJudged } from '../tenant-assets/layers.ts'
import type { OfficialSkillPorts } from './tenant-skills.ts'

/** A skill the release brings, as the official layer holds it, and the directory its files lie in. */
export type BroughtSkill = BroughtDefinition & Readonly<{ files: PackageReader; directory: string }>

/** Reads each skill the release brings as its category judges a package; one that cannot be read stops the start. */
export async function officialSkills(
  skills: readonly OfficialSkill[],
): Promise<readonly BroughtSkill[]> {
  const contract = skillBodyContract()
  const source = createDirectorySource()
  return Promise.all(
    skills.map(async ({ name, directory }) => {
      const files = directoryPackageReader(source, directory)
      const judged = await packageJudged(contract, files)
      if (judged === undefined)
        throw new Error(`the official skill ${name} in ${directory} cannot be read as a skill`)
      const item = officialItem(contract.category, name, judged.digest)
      return { name, item, body: judged.body, files, directory }
    }),
  )
}

/** What the Skill row reads of the skills the release brings. */
export function officialSkillPorts(
  brought: readonly BroughtSkill[],
  assets: OfficialAssets,
): OfficialSkillPorts {
  const category = skillBodyContract().category
  return {
    assets,
    directoryOf: (ref, version) =>
      brought.find(
        each => officialAssetRef(category, each.name) === ref && each.item.version === version,
      )?.directory,
  }
}
