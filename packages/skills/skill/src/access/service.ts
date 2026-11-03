// `SkillAccess` over the three ports: the four operations composed from the stages, in the
// order of the group page "读取". `describe` ends after `gate`; `list` after `pin`; `read` and
// `export` go on through `verifiedBytes`. Every operation checks on the spot; nothing is kept
// between calls.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  bodyOffsetOf,
  isControlFile,
  toPackagePath,
  type DescribeFailure,
  type ExportedEntry,
  type MediaType,
  type PackageEntry,
  type ReadResult,
  type ReadTarget,
  type SkillAccess,
  type SkillDescription,
  type SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import type { SkillPorts } from '../ports.ts'
import { verifiedBytes } from './bytes.ts'
import { gate, type Aborted, type Gated } from './gate.ts'
import {
  ADOPTED_MATERIAL_CHANGED,
  BASIS_UNAVAILABLE,
  materialOf,
  pin,
  type MovedFailure,
} from './pin.ts'
import { assertByteRange, sliceRange } from './range.ts'

const MANIFEST_PATH = 'SKILL.md'
const BAD_PATH = Object.freeze({ kind: 'bad-path' } as const)
const RESOURCE_MISSING = Object.freeze({ kind: 'resource-missing' } as const)

/** Step 4: the description. It reads no bytes. */
function descriptionOf(gated: Gated): SkillDescription {
  const { ref, declared } = gated
  const material = materialOf(gated)
  return {
    capability: ref.capability,
    layer: ref.layer,
    material:
      'ok' in material ? { kind: 'pinned', basis: material.ok } : { kind: 'no-readable-package' },
    dependencies: declared.tools,
    scripts: declared.scripts,
    settings: declared.settings,
    addressing: 'package-relative-path',
  }
}

/** `describe` gives the gate no signal, so the gate cannot answer it `aborted`. */
function describeFailure(failure: DescribeFailure | Aborted): DescribeFailure {
  if (failure.kind === 'aborted') throw new Error('unreachable: describe gives the gate no signal')
  return failure
}

/** Step 6: the part to read. A resource path is checked here; a control file is not a resource. */
function partOf(part: ReadTarget['part']): Outcome<ReadResult['part'], typeof BAD_PATH> {
  if (part.kind === 'body') return succeed(part)
  const checked = toPackagePath(part.path)
  if (!('ok' in checked) || isControlFile(checked.ok)) return fail(BAD_PATH)
  return succeed({ kind: 'resource', path: checked.ok })
}

/** What a moved material is for an operation that may or may not carry a basis. */
function movedFor(gated: Gated): MovedFailure {
  return gated.basis === undefined ? ADOPTED_MATERIAL_CHANGED : BASIS_UNAVAILABLE
}

/** Step 9: the entry of the snapshot at `path`, or `undefined`. No other package fills in. */
function entryAt(snapshot: SkillPackageSnapshot, path: string): PackageEntry | undefined {
  return snapshot.entries.find(entry => entry.path === path)
}

function mediaTypeOf(entry: PackageEntry): Readonly<{ mediaType?: MediaType }> {
  return entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }
}

export function createSkillAccess<P, S>(ports: SkillPorts<P, S>): SkillAccess<P, S> {
  return {
    async describe(access, scope, capability, options) {
      const gated = await gate(ports, access, scope, capability, options?.basis)
      return 'ok' in gated ? succeed(descriptionOf(gated.ok)) : fail(describeFailure(gated.failure))
    },

    async read(access, scope, target, options) {
      assertByteRange(options?.range)
      const { basis, signal } = options ?? {}
      const gated = await gate(ports, access, scope, target.capability, basis, signal)
      if (!('ok' in gated)) return gated
      const material = materialOf(gated.ok)
      if (!('ok' in material)) return material
      const part = partOf(target.part)
      if (!('ok' in part)) return part
      const pinned = await pin(ports, gated.ok, material.ok, movedFor(gated.ok), signal)
      if (!('ok' in pinned)) return pinned
      const entry = entryAt(
        pinned.ok.snapshot,
        part.ok.kind === 'body' ? MANIFEST_PATH : part.ok.path,
      )
      if (entry === undefined) return fail(RESOURCE_MISSING)
      const bytes = await verifiedBytes(ports, pinned.ok, entry, signal)
      if (!('ok' in bytes)) return bytes
      // Step 11: the body starts after the closing delimiter. Bytes without a legal frontmatter
      // have no header to leave out, so the whole entry is the body.
      const bodyOffset = part.ok.kind === 'body' ? (bodyOffsetOf(bytes.ok) ?? 0) : 0
      return succeed({
        basis: pinned.ok.basis,
        part: part.ok,
        ...mediaTypeOf(entry),
        ...sliceRange(bytes.ok, entry.encoding, options?.range, bodyOffset),
      })
    },

    async list(access, scope, capability, options) {
      const { basis, signal } = options ?? {}
      const gated = await gate(ports, access, scope, capability, basis, signal)
      if (!('ok' in gated)) return gated
      const material = materialOf(gated.ok)
      if (!('ok' in material)) return material
      const pinned = await pin(ports, gated.ok, material.ok, movedFor(gated.ok), signal)
      if (!('ok' in pinned)) return pinned
      // Step 8: only entries of a snapshot whose digest matched, without the control files.
      return succeed({
        basis: pinned.ok.basis,
        resources: pinned.ok.snapshot.entries.filter(entry => !isControlFile(entry.path)),
      })
    },

    async export(access, scope, capability, basis, options) {
      const signal = options?.signal
      const gated = await gate(ports, access, scope, capability, basis, signal)
      if (!('ok' in gated)) return gated
      const material = materialOf(gated.ok)
      if (!('ok' in material)) return material
      const pinned = await pin(ports, gated.ok, material.ok, BASIS_UNAVAILABLE, signal)
      if (!('ok' in pinned)) return pinned
      // Step 10 for every entry, the control files included. One failure ends the export: no
      // partial package.
      const entries: ExportedEntry[] = []
      for (const entry of pinned.ok.snapshot.entries) {
        const bytes = await verifiedBytes(ports, pinned.ok, entry, signal)
        if (!('ok' in bytes)) return bytes
        entries.push({
          path: entry.path,
          ...mediaTypeOf(entry),
          size: entry.size,
          digest: entry.digest,
          bytes: bytes.ok,
        })
      }
      return succeed({ basis: pinned.ok.basis, digest: pinned.ok.basis.digest, entries })
    },
  }
}
