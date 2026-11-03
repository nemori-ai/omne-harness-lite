// Checks one Skill package: the snapshot and the bytes of its control files. It gives the
// definition, or the first rejection reason in the order of the package rules.
import type { JsonLimits } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest } from '../digest.ts'
import type { InspectRejection, InspectRejectionCode } from '../failures.ts'
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
import { firstFinding, type Findings } from './shape.ts'

export type ParseInput = Readonly<{
  snapshot: SkillPackageSnapshot
  /** The bytes of `SKILL.md` and `.omne/skill.json`, present exactly when the snapshot has them. */
  control: Readonly<{ manifest?: Bytes; declaration?: Bytes }>
  expectedName?: SkillName
  /** The budget for `.omne/skill.json`. The default is the budget in the SPEC. */
  declarationLimits?: JsonLimits
}>

function reject(code: InspectRejectionCode, detail?: string): Outcome<never, InspectRejection> {
  return fail(
    Object.freeze(
      detail === undefined ? { kind: 'rejected', code } : { kind: 'rejected', code, detail },
    ),
  )
}

/**
 * The control bytes of `path`. They must be present exactly when the snapshot lists the path, and
 * their digest must be the digest of that entry: the caller checks the bytes before parsing.
 */
function controlBytes(
  entry: PackageEntry | undefined,
  bytes: Bytes | undefined,
  path: string,
): Bytes | undefined {
  if (entry === undefined && bytes === undefined) return undefined
  if (entry === undefined || bytes === undefined)
    throw new TypeError(`the control bytes of ${path} do not match the snapshot`)
  if (computeDigest(bytes) !== entry.digest)
    throw new TypeError(`the control bytes of ${path} do not have the digest of the snapshot entry`)
  return bytes
}

/**
 * The rejection order is: manifest-missing, name-mismatch, declaration-format-unsupported,
 * outside-package, tool-ref-invalid, setting-category-unknown, malformed. An unsupported
 * declaration format stops the other checks. It throws a TypeError when the snapshot was not made
 * by `sealSnapshot` or the control bytes do not match it.
 */
export function parseSkillPackage(input: ParseInput): Outcome<SkillDefinition, InspectRejection> {
  const { snapshot, control } = input
  assertSealed(snapshot)
  const entry = (path: string) => snapshot.entries.find(item => item.path === path)
  const manifestBytes = controlBytes(entry(MANIFEST_PATH), control.manifest, MANIFEST_PATH)
  const declarationBytes = controlBytes(
    entry(DECLARATION_PATH),
    control.declaration,
    DECLARATION_PATH,
  )
  if (manifestBytes === undefined) return reject('manifest-missing', 'the package has no SKILL.md')
  const manifest = readManifest(manifestBytes)
  const name = manifest.kind === 'ok' ? manifest.manifest.name : manifest.name
  if (name !== undefined && name !== snapshot.rootName)
    return reject('name-mismatch', 'the name differs from the package root name')
  if (name !== undefined && input.expectedName !== undefined && name !== input.expectedName)
    return reject('name-mismatch', 'the name differs from the expected name')
  const findings: Findings = []
  let declaration = EMPTY_DECLARATION
  if (declarationBytes !== undefined) {
    const paths = new Set<string>(snapshot.entries.map(item => item.path))
    const read = readDeclaration(
      declarationBytes,
      input.declarationLimits ?? DECLARATION_LIMITS,
      path => paths.has(path),
      findings,
    )
    if (read.kind === 'unsupported')
      return reject('declaration-format-unsupported', 'formatVersion is not 1')
    declaration = read.declaration
  }
  const first = firstFinding(findings)
  if (first !== undefined) return reject(first.code, first.detail)
  if (manifest.kind === 'malformed') return reject('malformed', manifest.detail)
  return succeed(Object.freeze({ manifest: manifest.manifest, declaration, snapshot }))
}
