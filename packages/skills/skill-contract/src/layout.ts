// The `layout` of the `skill` category (assets SPEC「正文是目录的类别」): the namespace, the package
// limits, and `inspect`, which checks a directory with the package rules of this contract and
// projects the asset body. A script is a file of the package, not a declaration.
import type {
  JsonValue,
  PackageLayout,
  PackageReader,
  PackageRejection,
} from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { computeDigest } from './digest.ts'
import { DECLARATION_PATH, isPackagePath, MANIFEST_PATH } from './names.ts'
import { parseSkillPackage } from './parse/package.ts'
import { projectAssetBody } from './project.ts'
import { sealSnapshot } from './snapshot.ts'
import type { Bytes, PackagePath } from './values.ts'

/** The limits of one Skill package: 200 files, 1 MiB for one file, 8 MiB for the package. */
export const SKILL_PACKAGE_LIMITS = Object.freeze({
  files: 200,
  fileBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
})

/** The root name of a package read through a reader. A reader names no directory, so the name
 * of the package is the name of its manifest. */
const READER_ROOT = 'package'

async function inspect(pkg: PackageReader): Promise<Outcome<JsonValue, PackageRejection>> {
  const manifest = await pkg.manifest()
  if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
  const files: { path: PackagePath; bytes: Bytes }[] = []
  for (const entry of manifest.ok.entries) {
    if (!isPackagePath(entry.path)) return fail({ kind: 'invalid-package', reason: 'bad-path' })
    const opened = await pkg.open(entry.path, entry.digest)
    if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
    if (computeDigest(opened.ok) !== entry.digest)
      return fail({ kind: 'source-failed', failure: 'material-unavailable' })
    files.push({ path: entry.path, bytes: opened.ok })
  }
  const sealed = sealSnapshot({ rootName: READER_ROOT, files })
  if (!('ok' in sealed)) return fail({ kind: 'invalid-package', reason: sealed.failure.kind })
  const control = (path: string) => files.find(file => file.path === path)?.bytes
  const manifestBytes = control(MANIFEST_PATH)
  const declaration = control(DECLARATION_PATH)
  const parsed = parseSkillPackage({
    snapshot: sealed.ok,
    control: {
      ...(manifestBytes === undefined ? {} : { manifest: manifestBytes }),
      ...(declaration === undefined ? {} : { declaration }),
    },
  })
  if (!('ok' in parsed))
    return fail(
      parsed.failure.kind === 'rejected'
        ? { kind: 'invalid-package', reason: parsed.failure.code }
        : { kind: 'source-failed', failure: 'material-unavailable' },
    )
  return succeed(projectAssetBody(parsed.ok))
}

export const skillLayout: PackageLayout = Object.freeze({
  namespace: 'skills',
  limits: SKILL_PACKAGE_LIMITS,
  inspect,
})
