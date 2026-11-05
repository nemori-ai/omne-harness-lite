// Where the unified cgroup hierarchy keeps a scope, read from `/proc/self/cgroup` and
// `/proc/self/mountinfo` text: unified, hybrid and legacy systemd layouts, a mount that shows only
// a subtree, and escaped mount points; then where a process stands for one unit. The last test runs
// the probe program outside its own unit.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  noUnifiedHierarchyExit,
  ownUnitPlacement,
  unifiedCgroupDirectory,
  unitPlacement,
} from '../src/scope-cgroup.ts'

const unit = 'omne-host-0b9c3a2e-5f0d-4d7e-9c51-2a0e6c1d4b7f.scope'
const scopePath = `/user.slice/user-1001.slice/user@1001.service/${unit}`

const tmpfsV1 =
  '33 24 0:28 / /sys/fs/cgroup ro,nosuid,nodev,noexec shared:9 - tmpfs tmpfs ro,mode=755'
const unifiedAt = (mountpoint: string, root = '/') =>
  `34 33 0:29 ${root} ${mountpoint} rw,nosuid,nodev,noexec,relatime shared:10 - cgroup2 cgroup2 rw,nsdelegate`
const systemdV1 =
  '35 33 0:30 / /sys/fs/cgroup/systemd rw,nosuid,nodev,noexec,relatime shared:11 - cgroup cgroup rw,xattr,name=systemd'

it('finds the scope under /sys/fs/cgroup on a unified host', () => {
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, `${unifiedAt('/sys/fs/cgroup')}\n`)).toBe(
    `/sys/fs/cgroup${scopePath}`,
  )
})

it('finds the scope under /sys/fs/cgroup/unified on a hybrid host, not in the v1 trees', () => {
  const procCgroup = `12:memory:/user.slice\n1:name=systemd:${scopePath}\n0::${scopePath}\n`
  const mountinfo = [tmpfsV1, unifiedAt('/sys/fs/cgroup/unified'), systemdV1].join('\n')
  expect(unifiedCgroupDirectory(procCgroup, mountinfo)).toBe(`/sys/fs/cgroup/unified${scopePath}`)
})

it('finds nothing on a legacy host, or where no unified mount is visible', () => {
  expect(
    unifiedCgroupDirectory(`1:name=systemd:${scopePath}\n`, [tmpfsV1, systemdV1].join('\n')),
  ).toBeUndefined()
  expect(
    unifiedCgroupDirectory(`0::${scopePath}\n`, [tmpfsV1, systemdV1].join('\n')),
  ).toBeUndefined()
})

it('maps the path below the root of a mount that shows only a subtree, and skips one that does not reach it', () => {
  const subtree = unifiedAt('/sys/fs/cgroup', '/user.slice/user-1001.slice')
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, subtree)).toBe(
    `/sys/fs/cgroup/user@1001.service/${unit}`,
  )
  const elsewhere = unifiedAt('/sys/fs/cgroup', '/system.slice')
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, elsewhere)).toBeUndefined()
  expect(
    unifiedCgroupDirectory(`0::${scopePath}\n`, [elsewhere, unifiedAt('/mnt/cg2')].join('\n')),
  ).toBe(`/mnt/cg2${scopePath}`)
  // A root is a whole path segment: `/user.slice/user-10` does not contain `user-1001.slice`.
  const prefix = unifiedAt('/sys/fs/cgroup', '/user.slice/user-10')
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, prefix)).toBeUndefined()
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, unifiedAt('/mnt', scopePath))).toBe('/mnt')
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, unifiedAt('/', '/user.slice'))).toBe(
    `/user-1001.slice/user@1001.service/${unit}`,
  )
  expect(unifiedCgroupDirectory(`0::/user.slice\n`, unifiedAt('/', '/user.slice'))).toBe('/')
})

it('places a process in its unit only on its own cgroup path, even where the mount root is that path', () => {
  const hybrid = [tmpfsV1, unifiedAt('/sys/fs/cgroup/unified'), systemdV1].join('\n')
  expect(unitPlacement(unit, `0::${scopePath}\n`, hybrid)).toEqual({
    kind: 'inUnit',
    directory: `/sys/fs/cgroup/unified${scopePath}`,
  })
  expect(unitPlacement(unit, `0::${scopePath}\n`, unifiedAt('/mnt', scopePath))).toEqual({
    kind: 'inUnit',
    directory: '/mnt',
  })
  const otherScope = `/user.slice/user-1001.slice/user@1001.service/omne-host-other.scope`
  expect(unitPlacement(unit, `0::${otherScope}\n`, hybrid)).toEqual({ kind: 'otherUnit' })
  expect(unitPlacement('', `0::/\n`, unifiedAt('/sys/fs/cgroup'))).toEqual({ kind: 'otherUnit' })
  expect(unitPlacement(`x/${unit}`, `0::/x/${unit}\n`, unifiedAt('/sys/fs/cgroup'))).toEqual({
    kind: 'otherUnit',
  })
})

it('sees no unified hierarchy on a legacy host, where the kernel still prints a 0:: line', () => {
  const legacy = [tmpfsV1, systemdV1].join('\n')
  expect(unitPlacement(unit, `1:name=systemd:${scopePath}\n0::/\n`, legacy)).toEqual({
    kind: 'noUnifiedHierarchy',
  })
  expect(unitPlacement(unit, `1:name=systemd:${scopePath}\n`, legacy)).toEqual({
    kind: 'noUnifiedHierarchy',
  })
})

it('decodes the octal escapes of a mount point', () => {
  expect(unifiedCgroupDirectory(`0::${scopePath}\n`, unifiedAt('/run/cgroup\\040v2'))).toBe(
    `/run/cgroup v2${scopePath}`,
  )
})

it(
  'fails when the probe program does not run in the unit it is named for',
  // Slow: starts a Node process.
  { tags: ['slow'], skip: process.platform !== 'linux' },
  async () => {
    const program = fileURLToPath(new URL('../dist/scope-probe.js', import.meta.url))
    const child = spawn(process.execPath, [program, unit], { stdio: 'ignore' })
    const [code] = await once(child, 'exit')
    // The probe program reads the same host as this test process.
    const visible = ownUnitPlacement(unit).kind !== 'noUnifiedHierarchy'
    expect(code).toBe(visible ? 1 : noUnifiedHierarchyExit)
  },
)
