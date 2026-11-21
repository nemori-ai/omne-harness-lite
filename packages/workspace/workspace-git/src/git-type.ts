import {
  loadBasis,
  reason,
  typeName,
  type Admission,
  type Inspection,
  type Material,
  type Recognised,
  type TypeAnswer,
  type TypeName,
} from '@omne-harness/workspace-contract'
import { DirectoryType, type DirectoryMaterial } from '@omne-harness/workspace-filesystem'
import { readWorkingCopy, type Repository } from './git-facts.ts'

export type GitMaterial = DirectoryMaterial & Readonly<{ repository: Repository }>

const OTHER = { kind: 'refused', reason: reason('not-the-same-resource') } as const

/** Stored material may name no repository, or not a whole one: that is the same as another one. */
const repositoryOf = (material: Material): Repository | undefined =>
  (material as Partial<GitMaterial>).repository ?? undefined

const same = (left: Repository | undefined, right: Repository): boolean =>
  left?.identity === right.identity && left.commonDirectory === right.commonDirectory

/** A directory that is also a working copy. Every override asks the directory type first. */
export class GitType extends DirectoryType {
  override readonly name: TypeName = typeName('git')!
  override readonly extends: TypeName | null = typeName('directory')

  override async recognise(address: string): Promise<TypeAnswer<Recognised>> {
    const directory = await super.recognise(address)
    if (!('ok' in directory)) return directory
    const copy = await readWorkingCopy(address)
    if (!('ok' in copy)) return copy
    const { repository } = copy.ok
    const material: GitMaterial = { ...(directory.ok.material as DirectoryMaterial), repository }
    return { ok: { material, occupancy: directory.ok.occupancy } }
  }

  /** Another working copy of the same repository is the same resource. */
  override admits(existing: readonly Material[], candidate: Recognised): Admission {
    const wanted = repositoryOf(candidate.material)
    return wanted !== undefined && existing.every(material => same(repositoryOf(material), wanted))
      ? { kind: 'admitted' }
      : OTHER
  }

  override async inspect(material: Material): Promise<TypeAnswer<Inspection>> {
    const directory = await super.inspect(material)
    if (!('ok' in directory)) return directory
    const copy = await readWorkingCopy(directory.ok.directory)
    if (!('ok' in copy)) return copy
    if (!same(repositoryOf(material), copy.ok.repository)) return { refused: reason('replaced') }
    return { ok: { directory: directory.ok.directory, basis: loadBasis(copy.ok.head) } }
  }
}
