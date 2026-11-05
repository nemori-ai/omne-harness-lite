// Where the unified cgroup hierarchy keeps the processes of one scope unit, read from what the kernel
// reports for this process instead of from an assumed mount point: systemd mounts the hierarchy at
// `/sys/fs/cgroup` in unified mode and at `/sys/fs/cgroup/unified` in hybrid mode. It uses Node
// built-ins only, so the gate scripts and the scope probe can import it.
import { readFileSync } from 'node:fs'

/** A mountinfo field with its octal escapes (`\040` for a space) decoded. */
function mountField(field: string | undefined): string | undefined {
  return field?.replace(/\\([0-7]{3})/gu, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

/**
 * The absolute directory of the cgroup that `/proc/self/cgroup` names in the unified hierarchy
 * (its `0::` line), under the `cgroup2` mount of `/proc/self/mountinfo` whose root contains it.
 * `undefined` when there is no unified hierarchy or no mount of it reaches that cgroup.
 */
export function unifiedCgroupDirectory(procCgroup: string, mountinfo: string): string | undefined {
  const path = procCgroup
    .split('\n')
    .find(line => line.startsWith('0::'))
    ?.slice(3)
  if (path === undefined || !path.startsWith('/')) return undefined
  for (const line of mountinfo.split('\n')) {
    const separator = line.indexOf(' - ')
    if (separator < 0 || line.slice(separator + 3).split(' ')[0] !== 'cgroup2') continue
    const fields = line.slice(0, separator).split(' ')
    const root = mountField(fields[3])
    const mountpoint = mountField(fields[4])
    if (root === undefined || mountpoint === undefined) continue
    const below =
      root === '/'
        ? path
        : path === root || path.startsWith(`${root}/`)
          ? path.slice(root.length)
          : undefined
    if (below === undefined) continue
    return mountpoint === '/' ? below || '/' : `${mountpoint}${below}`
  }
  return undefined
}

/** The unified cgroup directory of this process when it is the directory of `unit`, else `undefined`. */
export function ownScopeDirectory(unit: string): string | undefined {
  if (unit === '' || unit.includes('/')) return undefined
  let directory: string | undefined
  try {
    directory = unifiedCgroupDirectory(
      readFileSync('/proc/self/cgroup', 'utf8'),
      readFileSync('/proc/self/mountinfo', 'utf8'),
    )
  } catch {
    return undefined
  }
  return directory?.endsWith(`/${unit}`) === true ? directory : undefined
}

/** The process ids the kernel lists in `directory`, or `undefined` when the list cannot be read. */
export function scopeMembers(directory: string): readonly number[] | undefined {
  try {
    return readFileSync(`${directory}/cgroup.procs`, 'utf8').split('\n').filter(Boolean).map(Number)
  } catch {
    return undefined
  }
}
