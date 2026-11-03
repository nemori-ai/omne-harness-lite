// Checks one Skill package: the snapshot and the bytes of its control files. It gives the
// definition, or the first rejection reason in the order of the package rules.
import type { JsonLimits } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest } from '../digest.ts'
import type { InspectFailure, InspectRejectionCode } from '../failures.ts'
import { DECLARATION_PATH, MANIFEST_PATH } from '../names.ts'
import { assertSealed } from '../snapshot.ts'
import type {
  Bytes,
  PackageEntry,
  SkillDefinition,
  SkillName,
  SkillPackageSnapshot,
} from '../values.ts'
import { DECLARATION_LIMITS, EMPTY_DECLARATION, readDeclaration } from './declaration.ts'
import { readManifest } from './manifest.ts'
import { firstFinding, type Finding } from './shape.ts'

/** What a check gives instead of a definition: a rejection, or control bytes off the snapshot. */
export type ParseFailure = Extract<InspectFailure, { kind: 'rejected' | 'version-changed' }>

export type ParseInput = Readonly<{
  snapshot: SkillPackageSnapshot
  /** The bytes of `SKILL.md` and `.omne/skill.json`, present exactly when the snapshot has them. */
  control: Readonly<{ manifest?: Bytes; declaration?: Bytes }>
  expectedName?: SkillName
  /** The budget for `.omne/skill.json`. The default is the budget in the SPEC. */
  declarationLimits?: JsonLimits
}>

function reject(code: InspectRejectionCode, detail?: string): Outcome<never, ParseFailure> {
  return fail(
    Object.freeze(
      detail === undefined ? { kind: 'rejected', code } : { kind: 'rejected', code, detail },
    ),
  )
}

/**
 * Whether the control bytes belong to the snapshot: present exactly when the snapshot lists the
 * path, and with the digest of that entry.
 */
function belongs(entry: PackageEntry | undefined, bytes: Bytes | undefined): boolean {
  if (entry === undefined || bytes === undefined) return entry === bytes
  return computeDigest(bytes) === entry.digest
}

/**
 * The rejection order is: manifest-missing, name-mismatch, declaration-format-unsupported,
 * outside-package, tool-ref-invalid, setting-category-unknown, malformed. An unsupported
 * declaration format stops the other checks. Control bytes that do not belong to the snapshot give
 * `version-changed`. It throws a TypeError when the snapshot was not made by `sealSnapshot`.
 *
 * The checks stay in one function on purpose: their order is the contract, and one reading of
 * this body shows it.
 */
export function parseSkillPackage(input: ParseInput): Outcome<SkillDefinition, ParseFailure> {
  const { snapshot, control } = input
  assertSealed(snapshot)
  const entry = (path: string) => snapshot.entries.find(item => item.path === path)
  const manifestEntry = entry(MANIFEST_PATH)
  if (
    !belongs(manifestEntry, control.manifest) ||
    !belongs(entry(DECLARATION_PATH), control.declaration)
  )
    return fail(Object.freeze({ kind: 'version-changed' }))
  if (control.manifest === undefined)
    return reject('manifest-missing', 'the package has no SKILL.md')
  const manifest = readManifest(control.manifest)
  const name = manifest.kind === 'ok' ? manifest.manifest.name : manifest.name
  const mismatch = nameMismatch(name, snapshot.rootName, input.expectedName)
  if (mismatch !== undefined) return reject('name-mismatch', mismatch)
  let declaration = EMPTY_DECLARATION
  let findings: readonly Finding[] = []
  if (control.declaration !== undefined) {
    const paths = new Set<string>(snapshot.entries.map(item => item.path))
    const limits = input.declarationLimits ?? DECLARATION_LIMITS
    const read = readDeclaration(control.declaration, limits, path => paths.has(path))
    if (read.kind === 'unsupported')
      return reject('declaration-format-unsupported', 'formatVersion is not 1')
    declaration = read.declaration
    findings = read.findings
  }
  const first = firstFinding(findings)
  if (first !== undefined) return reject(first.code, first.detail)
  if (manifest.kind === 'malformed') return reject('malformed', manifest.detail)
  return succeed(Object.freeze({ manifest: manifest.manifest, declaration, snapshot }))
}

/** Why the name breaks the name rule, or `undefined`. A name that could not be read is not compared. */
function nameMismatch(
  name: string | undefined,
  rootName: string,
  expected: SkillName | undefined,
): string | undefined {
  if (name === undefined) return undefined
  if (name !== rootName) return 'the name differs from the package root name'
  if (expected !== undefined && name !== expected) return 'the name differs from the expected name'
  return undefined
}
