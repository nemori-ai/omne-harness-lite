import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import {
  loadBasis,
  reason,
  typeName,
  type Admission,
  type Inspection,
  type LoadBasis,
  type ManagementType,
  type Material,
  type Recognised,
  type TypeAnswer,
  type TypeName,
} from '@omne-harness/workspace-contract'

/** What the directory type keeps about one materialisation. The scope has one root today. */
export type DirectoryMaterial = Readonly<{
  scope: Readonly<{ root: string }>
  /** The device and inode of the root when it was recognised. */
  rootIdentity: string
}>

/** A directory has no versions: every look gives this basis. */
export const UNPINNED: LoadBasis = loadBasis('unpinned')

const MISSING = new Set(['ENOENT', 'ENOTDIR'])
const codeOf = (error: unknown): string => String((error as NodeJS.ErrnoException).code)

type Looked = Readonly<{ identity: string }>

/**
 * A look at a path that follows no link: it is a directory, and the path given is its real path.
 * A path that is missing or is something else is a refusal; a path that cannot be looked at is
 * `unavailable`.
 */
async function look(path: string): Promise<TypeAnswer<Looked>> {
  try {
    const stat = await lstat(path, { bigint: true })
    if (!stat.isDirectory()) return { refused: reason('not-a-directory') }
    if ((await realpath(path)) !== path) return { refused: reason('not-the-real-path') }
    return { ok: { identity: `${stat.dev}:${stat.ino}` } }
  } catch (error) {
    const code = codeOf(error)
    return MISSING.has(code) ? { refused: reason('not-found') } : { unavailable: code }
  }
}

/** Material is read back from storage, so its shape is checked before it is used. */
function materialOf(value: Material): DirectoryMaterial | null {
  const stored = value as { scope?: { root?: unknown }; rootIdentity?: unknown } | null
  const root = stored?.scope?.root
  const rootIdentity = stored?.rootIdentity
  return typeof root === 'string' && typeof rootIdentity === 'string'
    ? { scope: { root }, rootIdentity }
    : null
}

/**
 * The filesystem type: a workspace that physically is a directory. It reads the directory's
 * place and identity and nothing inside it.
 */
export class DirectoryType implements ManagementType {
  readonly name: TypeName = typeName('directory')!
  readonly extends: TypeName | null = null

  async recognise(address: string): Promise<TypeAnswer<Recognised>> {
    if (!isAbsolute(address) || resolve(address) !== address)
      return { refused: reason('not-an-absolute-path') }
    const looked = await look(address)
    if (!('ok' in looked)) return looked
    const material: DirectoryMaterial = {
      scope: { root: address },
      rootIdentity: looked.ok.identity,
    }
    return { ok: { material, occupancy: address } }
  }

  /** Nothing says a second directory is the same resource, so a workspace of this type has one instance. */
  admits(existing: readonly Material[], _candidate: Recognised): Admission {
    return existing.length === 0
      ? { kind: 'admitted' }
      : { kind: 'refused', reason: reason('not-the-same-resource') }
  }

  async inspect(material: Material): Promise<TypeAnswer<Inspection>> {
    const known = materialOf(material)
    if (known === null) return { unavailable: 'material' }
    const looked = await look(known.scope.root)
    if (!('ok' in looked)) return looked
    // Another directory under the same name is another resource. It is not followed.
    if (looked.ok.identity !== known.rootIdentity) return { refused: reason('replaced') }
    return { ok: { directory: known.scope.root, basis: UNPINNED } }
  }
}
