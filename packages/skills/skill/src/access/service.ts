// `SkillAccess` over the three ports: the four operations composed from the three stages.
// `describe` ends after `gate`, `list` after `pin`, `read` and `export` go through
// `verifiedBytes`. Every operation checks on the spot; nothing is kept between calls.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  bodyOffsetOf,
  isControlFile,
  toPackagePath,
  type PackageDigest,
  type PackagePath,
  type ReadResult,
  type ReadTarget,
  type SkillAccess,
  type SkillDescription,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { SkillRef } from '@omne-harness/skill-contract/provider'
import type { SkillPorts } from '../ports.ts'
import { verifiedBytes } from './bytes.ts'
import { gate, type Gated } from './gate.ts'
import { pin } from './pin.ts'
import { sliceRange } from './range.ts'

const MANIFEST_PATH = 'SKILL.md'

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

/** Step 6: the part to read. A resource path is checked here; a control file is not a resource. */
function partOf(part: ReadTarget['part']): Outcome<ReadResult['part'], { kind: 'bad-path' }> {
  if (part.kind === 'body') return succeed(part)
  const checked = toPackagePath(part.path)
  if (!('ok' in checked) || isControlFile(checked.ok)) return fail({ kind: 'bad-path' })
  return succeed({ kind: 'resource', path: checked.ok })
}

function entryPathOf(part: ReadResult['part']): PackagePath | typeof MANIFEST_PATH {
  return part.kind === 'body' ? MANIFEST_PATH : part.path
}

export function createSkillAccess<P, S>(ports: SkillPorts<P, S>): SkillAccess<P, S> {
  return {
    async describe(access, scope, capability, options) {
      const gated = await gate(ports, access, scope, capability, options?.basis)
      return 'ok' in gated ? succeed(descriptionOf(gated.ok)) : gated
    },

    async read(access, scope, target, options) {
      const gated = await gate(ports, access, scope, target.capability, options?.basis)
      if (!('ok' in gated)) return gated
      const part = partOf(target.part)
      if (!('ok' in part)) return part
      const pinned = await pin(ports, gated.ok, options?.signal)
      if (!('ok' in pinned)) return pinned
      const verified = await verifiedBytes(ports, pinned.ok, entryPathOf(part.ok), options?.signal)
      if (!('ok' in verified)) return verified
      const { entry, bytes } = verified.ok
      // Step 11: the body starts after the closing delimiter. Bytes without a legal frontmatter
      // have no header to leave out, so the whole entry is the body.
      const bodyOffset = part.ok.kind === 'body' ? (bodyOffsetOf(bytes) ?? 0) : 0
      return succeed({
        basis: basisOf(gated.ok.ref, pinned.ok.digest),
        part: part.ok,
        ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
        ...sliceRange(bytes, entry.encoding, options?.range, bodyOffset),
      })
    },

    async list(access, scope, capability, options) {
      const gated = await gate(ports, access, scope, capability, options?.basis)
      if (!('ok' in gated)) return gated
      const pinned = await pin(ports, gated.ok, options?.signal)
      if (!('ok' in pinned)) return pinned
      // Step 8: only entries of a snapshot whose digest matched, without the control files.
      return succeed({
        basis: basisOf(gated.ok.ref, pinned.ok.digest),
        resources: pinned.ok.snapshot.entries.filter(entry => !isControlFile(entry.path)),
      })
    },

    async export() {
      throw new Error('export arrives with slice 04')
    },
  }
}
