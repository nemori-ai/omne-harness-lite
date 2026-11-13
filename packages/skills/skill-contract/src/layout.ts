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

type File = Readonly<{ path: PackagePath; bytes: Bytes }>

/** Every file of the manifest, read through the reader by its path and digest. */
async function readFiles(pkg: PackageReader): Promise<Outcome<File[], PackageRejection>> {
  const manifest = await pkg.manifest()
  if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
  const files: File[] = []
  for (const entry of manifest.ok.entries) {
    if (!isPackagePath(entry.path)) return fail({ kind: 'invalid-package', reason: 'bad-path' })
    const opened = await pkg.open(entry.path, entry.digest)
    if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
    if (computeDigest(opened.ok) !== entry.digest)
      return fail({ kind: 'source-failed', failure: 'material-unavailable' })
    files.push({ path: entry.path, bytes: opened.ok })
  }
  return succeed(files)
}

/** The package rules of this contract over the files, and the asset body they project. */
function checkFiles(files: readonly File[]): Outcome<JsonValue, PackageRejection> {
  const sealed = sealSnapshot({ rootName: READER_ROOT, files })
  if (!('ok' in sealed)) return fail({ kind: 'invalid-package', reason: sealed.failure.kind })
  const control = (path: string) => files.find(file => file.path === path)?.bytes
  const manifest = control(MANIFEST_PATH)
  const declaration = control(DECLARATION_PATH)
  const parsed = parseSkillPackage({
    snapshot: sealed.ok,
    control: {
      ...(manifest === undefined ? {} : { manifest }),
      ...(declaration === undefined ? {} : { declaration }),
    },
  })
  if ('ok' in parsed) return succeed(projectAssetBody(parsed.ok))
  // The control bytes come from the files that the snapshot was sealed from.
  if (parsed.failure.kind !== 'rejected')
    throw new Error('unreachable: the control bytes belong to the snapshot')
  return fail({ kind: 'invalid-package', reason: parsed.failure.code })
}

async function inspect(pkg: PackageReader): Promise<Outcome<JsonValue, PackageRejection>> {
  const files = await readFiles(pkg)
  return 'ok' in files ? checkFiles(files.ok) : files
}

export const skillLayout: PackageLayout = Object.freeze({
  namespace: 'skills',
  limits: SKILL_PACKAGE_LIMITS,
  inspect,
})
