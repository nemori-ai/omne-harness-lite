// `PackageInspection` over one source: one snapshot, the bytes of the control files that the
// snapshot lists, then the package rules of the contract. The rules check the control bytes
// against the snapshot themselves, so nothing is checked twice here.
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  DECLARATION_PATH,
  MANIFEST_PATH,
  parseSkillPackage,
  type Bytes,
  type InspectFailure,
  type SkillDefinition,
  type SkillName,
} from '@omne-harness/skill-contract'
import {
  isSealedSnapshot,
  type PackageInspection,
  type PackageLocator,
  type SkillPackageSource,
} from '@omne-harness/skill-contract/provider'
import { sourceFailureTo } from './mapping.ts'
import { isBytes, sourceAnswer } from './source-answer.ts'

export function createPackageInspection(source: SkillPackageSource): PackageInspection {
  return {
    async inspect(
      locator: PackageLocator,
      options?: Readonly<{ expectedName?: SkillName }>,
    ): Promise<Outcome<SkillDefinition, InspectFailure>> {
      const taken = await sourceAnswer(() => source.snapshot(locator), isSealedSnapshot)
      if (!('ok' in taken)) return fail(sourceFailureTo('inspect', taken.failure, 'snapshot'))
      const snapshot = taken.ok
      /** The bytes of a control file that the snapshot lists, or `undefined` when it does not. */
      const control = async (path: string): Promise<Outcome<Bytes | undefined, InspectFailure>> => {
        const entry = snapshot.entries.find(item => item.path === path)
        if (entry === undefined) return { ok: undefined }
        const opened = await sourceAnswer(
          () => source.open(locator, snapshot.digest, entry.path),
          isBytes,
        )
        return 'ok' in opened ? opened : fail(sourceFailureTo('inspect', opened.failure, 'open'))
      }
      const manifest = await control(MANIFEST_PATH)
      if (!('ok' in manifest)) return manifest
      const declaration = await control(DECLARATION_PATH)
      if (!('ok' in declaration)) return declaration
      const expectedName = options?.expectedName
      return parseSkillPackage({
        snapshot,
        control: {
          ...(manifest.ok === undefined ? {} : { manifest: manifest.ok }),
          ...(declaration.ok === undefined ? {} : { declaration: declaration.ok }),
        },
        ...(expectedName === undefined ? {} : { expectedName }),
      })
    },
  }
}
