import type { JsonLimits } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest } from '../digest.ts'
import type { InspectFailure, InspectRejectionCode } from '../failures.ts'
import { orderedHints } from '../hints.ts'
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

export type ParseFailure = Extract<InspectFailure, { kind: 'rejected' | 'version-changed' }>

export type ParseInput = Readonly<{
  snapshot: SkillPackageSnapshot
  control: Readonly<{ manifest?: Bytes; declaration?: Bytes }>
  expectedName?: SkillName
  declarationLimits?: JsonLimits
}>

function reject(code: InspectRejectionCode, detail?: string): Outcome<never, ParseFailure> {
  return fail(
    Object.freeze(
      detail === undefined ? { kind: 'rejected', code } : { kind: 'rejected', code, detail },
    ),
  )
}

function belongs(entry: PackageEntry | undefined, bytes: Bytes | undefined): boolean {
  if (entry === undefined || bytes === undefined) return entry === bytes
  return computeDigest(bytes) === entry.digest
}

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
  const { expectedName } = input
  if (name !== undefined && expectedName !== undefined && name !== expectedName)
    return reject('name-mismatch', 'the name differs from the expected name')
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
  const renamed = manifest.manifest.name !== snapshot.rootName
  const hints = orderedHints([
    ...(renamed ? (['name-differs-from-root'] as const) : []),
    ...manifest.hints,
  ])
  return succeed(
    Object.freeze({
      manifest: manifest.manifest,
      declaration,
      snapshot,
      ...(hints.length === 0 ? {} : { compatibilityHints: hints }),
    }),
  )
}
