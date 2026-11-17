import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  bodyOffsetOf,
  isControlFile,
  MANIFEST_PATH,
  toPackagePath,
  type MediaType,
  type PackageEntry,
  type ReadResult,
  type ReadTarget,
  type SkillAccess,
  type SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import type { SkillPorts } from '../ports.ts'
import { verifiedBytes } from './bytes.ts'
import { gate, type Gated } from './gate.ts'
import {
  ADOPTED_MATERIAL_CHANGED,
  BASIS_UNAVAILABLE,
  materialOf,
  pin,
  type MovedFailure,
} from './pin.ts'
import { assertByteRange, sliceRange } from './range.ts'

const BAD_PATH = Object.freeze({ kind: 'bad-path' } as const)
const RESOURCE_MISSING = Object.freeze({ kind: 'resource-missing' } as const)
const SOURCE_UNAVAILABLE = Object.freeze({ kind: 'source-unavailable' } as const)

function partOf(part: ReadTarget['part']): Outcome<ReadResult['part'], typeof BAD_PATH> {
  if (part.kind === 'body') return succeed(part)
  const checked = toPackagePath(part.path)
  if (!('ok' in checked) || isControlFile(checked.ok)) return fail(BAD_PATH)
  return succeed({ kind: 'resource', path: checked.ok })
}

function movedFor(gated: Gated): MovedFailure {
  return gated.basis === undefined ? ADOPTED_MATERIAL_CHANGED : BASIS_UNAVAILABLE
}

function entryAt(snapshot: SkillPackageSnapshot, path: string): PackageEntry | undefined {
  return snapshot.entries.find(entry => entry.path === path)
}

function mediaTypeOf(entry: PackageEntry): Readonly<{ mediaType?: MediaType }> {
  return entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }
}

export function createSkillAccess<P, S>(ports: SkillPorts<P, S>): SkillAccess<P, S> {
  return {
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
      const bodyOffset = part.ok.kind === 'body' ? bodyOffsetOf(bytes.ok) : 0
      if (bodyOffset === undefined) return fail(SOURCE_UNAVAILABLE)
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
      return succeed({
        basis: pinned.ok.basis,
        resources: pinned.ok.snapshot.entries.filter(entry => !isControlFile(entry.path)),
      })
    },
  }
}
