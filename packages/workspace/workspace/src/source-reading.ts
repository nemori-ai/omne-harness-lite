import type {
  SourceDigests,
  SourceFiles,
  SourceLayout,
  SourcePackage,
  SourceRoot,
} from '@omne-harness/workspace-contract'

/** Where each source root sits under the root directory of an instance; the local one comes first. */
export const SOURCE_ROOTS: readonly Readonly<{ root: SourceRoot; directory: string }>[] = [
  { root: 'local', directory: '.omne.local' },
  { root: 'shared', directory: '.omne' },
]

export const directoryOfRoot = (root: SourceRoot): string =>
  SOURCE_ROOTS.find(item => item.root === root)!.directory

export type SourceReadingPorts = Readonly<{ files: SourceFiles; digests: SourceDigests }>

type Pass = Readonly<{ packages: readonly SourcePackage[] }> | Readonly<{ unreadable: string }>

// Paths are unique within a package, so no two compare equal.
const byPath = (left: { path: string }, right: { path: string }) =>
  left.path < right.path ? -1 : 1

async function readPackage(
  ports: SourceReadingPorts,
  directory: string,
  layout: SourceLayout,
  root: SourceRoot,
  name: string,
): Promise<SourcePackage | 'skipped' | 'unreadable'> {
  const path = [directoryOfRoot(root), layout.namespace, name]
  const read = await ports.files.files(directory, path, layout.limits)
  if (read.kind === 'unreadable') return 'unreadable'
  // Gone, too large or linked: such a package is not one of the reading.
  if (read.kind !== 'read') return 'skipped'
  const entries = read.files
    .map(file => ({
      path: file.path,
      bytes: file.bytes.byteLength,
      digest: ports.digests.file(file.bytes),
    }))
    .sort(byPath)
  const { category, namespace } = layout
  return { category, namespace, name, root, version: ports.digests.package(entries), entries }
}

async function readOnce(
  ports: SourceReadingPorts,
  directory: string,
  layouts: readonly SourceLayout[],
): Promise<Pass> {
  const packages: SourcePackage[] = []
  for (const layout of layouts) {
    const listed = await Promise.all(
      SOURCE_ROOTS.map(item =>
        ports.files.directories(directory, [item.directory, layout.namespace]),
      ),
    )
    // For each name, the local package comes before the shared one.
    for (const name of [...new Set(listed.flatMap(names => names ?? []))].sort())
      for (const [at, { root, directory: rootDirectory }] of SOURCE_ROOTS.entries()) {
        if (listed[at]?.includes(name) !== true) continue
        const read = await readPackage(ports, directory, layout, root, name)
        if (read === 'unreadable')
          return { unreadable: `${rootDirectory}/${layout.namespace}/${name} cannot be read` }
        if (read !== 'skipped') packages.push(read)
      }
  }
  return { packages }
}

const sameAs = (left: Pass, right: Pass) => JSON.stringify(left) === JSON.stringify(right)

/**
 * The packages under both source roots, read as one consistent whole: two passes that agree. When
 * the files change in between, one more pass is made; when that one differs too, nothing is read.
 */
export async function readSources(
  ports: SourceReadingPorts,
  directory: string,
  layouts: readonly SourceLayout[],
): Promise<Readonly<{ packages: readonly SourcePackage[] }> | Readonly<{ unreadable: string }>> {
  try {
    const first = await readOnce(ports, directory, layouts)
    if ('unreadable' in first) return first
    const second = await readOnce(ports, directory, layouts)
    if (sameAs(first, second)) return first
    const third = await readOnce(ports, directory, layouts)
    if ('unreadable' in third) return third
    return sameAs(second, third)
      ? third
      : { unreadable: 'the source roots kept changing while they were read' }
  } catch (cause) {
    return { unreadable: `the source roots cannot be read: ${String(cause)}` }
  }
}
