import { readFileSync } from 'node:fs'

export const noUnifiedHierarchyExit = 3

export type UnitPlacement =
  | Readonly<{ kind: 'inUnit'; directory: string }>
  | Readonly<{ kind: 'noUnifiedHierarchy' }>
  | Readonly<{ kind: 'otherUnit' }>
  | Readonly<{ kind: 'unreadable' }>

function mountField(field: string | undefined): string | undefined {
  return field?.replace(/\\([0-7]{3})/gu, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

function unifiedCgroupPath(procCgroup: string): string | undefined {
  const path = procCgroup
    .split('\n')
    .find(line => line.startsWith('0::'))
    ?.slice(3)
  return path?.startsWith('/') === true ? path : undefined
}

function cgroup2Mount(line: string): { root: string; mountpoint: string } | undefined {
  const separator = line.indexOf(' - ')
  if (separator < 0 || line.slice(separator + 3).split(' ')[0] !== 'cgroup2') return undefined
  const fields = line.slice(0, separator).split(' ')
  const root = mountField(fields[3])
  const mountpoint = mountField(fields[4])
  return root === undefined || mountpoint === undefined ? undefined : { root, mountpoint }
}

function pathBelow(root: string, path: string): string | undefined {
  if (root === '/') return path
  return path === root || path.startsWith(`${root}/`) ? path.slice(root.length) : undefined
}

export function cgroupDirectory(path: string, mountinfo: string): string | undefined {
  for (const line of mountinfo.split('\n')) {
    const mount = cgroup2Mount(line)
    const below = mount === undefined ? undefined : pathBelow(mount.root, path)
    if (mount === undefined || below === undefined) continue
    return mount.mountpoint === '/' ? below || '/' : `${mount.mountpoint}${below}`
  }
  return undefined
}

export function unifiedCgroupDirectory(procCgroup: string, mountinfo: string): string | undefined {
  const path = unifiedCgroupPath(procCgroup)
  return path === undefined ? undefined : cgroupDirectory(path, mountinfo)
}

export function unitPlacement(unit: string, procCgroup: string, mountinfo: string): UnitPlacement {
  const path = unifiedCgroupPath(procCgroup)
  const directory = path === undefined ? undefined : cgroupDirectory(path, mountinfo)
  if (path === undefined || directory === undefined) return { kind: 'noUnifiedHierarchy' }
  const inUnit = unit !== '' && !unit.includes('/') && path.endsWith(`/${unit}`)
  return inUnit ? { kind: 'inUnit', directory } : { kind: 'otherUnit' }
}

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

export function scopeMembers(directory: string): readonly number[] | undefined {
  try {
    return readFileSync(`${directory}/cgroup.procs`, 'utf8').split('\n').filter(Boolean).map(Number)
  } catch {
    return undefined
  }
}
