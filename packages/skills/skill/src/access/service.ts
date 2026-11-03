// `SkillAccess` over the three ports: the four operations composed from the three stages.
// `describe` ends after `gate`, `list` after `pin`, `read` and `export` go through
// `verifiedBytes`. Every operation checks on the spot; nothing is kept between calls.
import { succeed } from '@omne-harness/operation-result'
import type {
  PackageDigest,
  SkillAccess,
  SkillDescription,
  SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { SkillRef } from '@omne-harness/skill-contract/provider'
import type { SkillPorts } from '../ports.ts'
import { gate, type Gated } from './gate.ts'

/** The basis of the material of `ref`, pinned at `digest`. */
function basisOf(ref: SkillRef, digest: PackageDigest): SkillMaterialBasis {
  return {
    capability: ref.capability,
    layer: ref.layer,
    ...(ref.assetVersion === undefined ? {} : { assetVersion: ref.assetVersion }),
    digest,
  }
}

/** Step 4: the description from the declared projection. It reads no bytes. */
function descriptionOf(gated: Gated): SkillDescription {
  const { ref, declared } = gated
  return {
    capability: ref.capability,
    layer: ref.layer,
    material:
      ref.digest === undefined
        ? { kind: 'no-readable-package' }
        : { kind: 'pinned', basis: basisOf(ref, ref.digest) },
    dependencies: declared.tools,
    scripts: declared.scripts,
    settings: declared.settings,
    addressing: 'package-relative-path',
  }
}

export function createSkillAccess<P, S>(ports: SkillPorts<P, S>): SkillAccess<P, S> {
  return {
    async describe(access, scope, capability, options) {
      const gated = await gate(ports, access, scope, capability, options?.basis)
      return 'ok' in gated ? succeed(descriptionOf(gated.ok)) : gated
    },
    async read() {
      throw new Error('read arrives with slice 03')
    },
    async list() {
      throw new Error('list arrives with slice 03')
    },
    async export() {
      throw new Error('export arrives with slice 04')
    },
  }
}
