// Where the unified cgroup hierarchy keeps the processes of one scope unit, read from what the kernel
// reports for the calling process instead of from an assumed mount point: systemd mounts the
// hierarchy at `/sys/fs/cgroup` in unified mode and at `/sys/fs/cgroup/unified` in hybrid mode. It
// uses Node built-ins only, like the scope probe program and the terminal gate that import it.
import { readFileSync } from 'node:fs'

/** The exit code of the scope probe program when it sees no unified hierarchy (P5, `cgroup-v2`). */
export const noUnifiedHierarchyExit = 3

/** Where the calling process stands in the unified hierarchy, judged for one unit. */
export type UnitPlacement =
  | Readonly<{ kind: 'inUnit'; directory: string }>
  /** No `0::` line, or no visible `cgroup2` mount reaches its path. */
  | Readonly<{ kind: 'noUnifiedHierarchy' }>
  /** The hierarchy is visible, but the cgroup of the process is not the unit. */
  | Readonly<{ kind: 'otherUnit' }>
  /** `/proc/self/cgroup` or `/proc/self/mountinfo` cannot be read. */
  | Readonly<{ kind: 'unreadable' }>

/** A mountinfo field with its octal escapes (`\040` for a space) decoded. */
function mountField(field: string | undefined): string | undefined {
  return field?.replace(/\\([0-7]{3})/gu, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

/** The cgroup path of the `0::` line of `/proc/self/cgroup`. */
function unifiedCgroupPath(procCgroup: string): string | undefined {
  const path = procCgroup
    .split('\n')
    .find(line => line.startsWith('0::'))
    ?.slice(3)
  return path?.startsWith('/') === true ? path : undefined
}

/** The root and mount point of a `cgroup2` line of `/proc/self/mountinfo`, else `undefined`. */
function cgroup2Mount(line: string): { root: string; mountpoint: string } | undefined {
  const separator = line.indexOf(' - ')
  if (separator < 0 || line.slice(separator + 3).split(' ')[0] !== 'cgroup2') return undefined
  const fields = line.slice(0, separator).split(' ')
  const root = mountField(fields[3])
  const mountpoint = mountField(fields[4])
  return root === undefined || mountpoint === undefined ? undefined : { root, mountpoint }
}

/** `path` relative to a mount `root` that contains it, segment by segment, else `undefined`. */
function pathBelow(root: string, path: string): string | undefined {
  if (root === '/') return path
  return path === root || path.startsWith(`${root}/`) ? path.slice(root.length) : undefined
}

/**
 * The directory of cgroup `path` (as the kernel or `systemctl show -p ControlGroup` names it) under
 * the first `cgroup2` mount of `mountinfo` whose root contains it; `undefined` when no mount does.
 */
export function cgroupDirectory(path: string, mountinfo: string): string | undefined {
  for (const line of mountinfo.split('\n')) {
    const mount = cgroup2Mount(line)
    const below = mount === undefined ? undefined : pathBelow(mount.root, path)
    if (mount === undefined || below === undefined) continue
    return mount.mountpoint === '/' ? below || '/' : `${mount.mountpoint}${below}`
  }
  return undefined
}

/**
 * The absolute directory of the cgroup that `/proc/self/cgroup` names in the unified hierarchy
 * (its `0::` line), under the first `cgroup2` mount of `/proc/self/mountinfo` whose root contains
 * it. `undefined` when there is no unified hierarchy or no mount of it reaches that cgroup.
 */
export function unifiedCgroupDirectory(procCgroup: string, mountinfo: string): string | undefined {
  const path = unifiedCgroupPath(procCgroup)
  return path === undefined ? undefined : cgroupDirectory(path, mountinfo)
}

/**
 * Where the process that read these two texts stands for `unit`. The unit is judged on the cgroup
 * path itself, so a mount whose root is the unit's cgroup still places the process in its unit.
 */
export function unitPlacement(unit: string, procCgroup: string, mountinfo: string): UnitPlacement {
  const path = unifiedCgroupPath(procCgroup)
  const directory = path === undefined ? undefined : cgroupDirectory(path, mountinfo)
  if (path === undefined || directory === undefined) return { kind: 'noUnifiedHierarchy' }
  const inUnit = unit !== '' && !unit.includes('/') && path.endsWith(`/${unit}`)
  return inUnit ? { kind: 'inUnit', directory } : { kind: 'otherUnit' }
}

/** Where this process stands for `unit`, from its own `/proc/self` texts. */
export function ownUnitPlacement(unit: string): UnitPlacement {
  let procCgroup: string
  let mountinfo: string
  try {
    procCgroup = readFileSync('/proc/self/cgroup', 'utf8')
    mountinfo = readFileSync('/proc/self/mountinfo', 'utf8')
  } catch {
    return { kind: 'unreadable' }
  }
  return unitPlacement(unit, procCgroup, mountinfo)
}

/** The process ids the kernel lists in `directory`, or `undefined` when the list cannot be read. */
export function scopeMembers(directory: string): readonly number[] | undefined {
  try {
    return readFileSync(`${directory}/cgroup.procs`, 'utf8').split('\n').filter(Boolean).map(Number)
  } catch {
    return undefined
  }
}
