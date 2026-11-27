import { createHash } from 'node:crypto'
import { taken, trimmed, unknown, type Field, type Sources } from './field.ts'

export type Runtime = Readonly<{
  node: string
  v8: string
  sqlite: Field<string>
  sqliteOptions: Field<string>
  /** the heap options the process was started with, by name; no other option is recorded */
  heapOptions: readonly string[]
  threadPool: number
}>

/** What decides the cost of the work on this machine. Nothing here names the machine or who runs on it. */
export type Machine = Readonly<{
  cpu: Readonly<{
    model: Field<string>
    architecture: string
    sockets: Field<number>
    cores: Field<number>
    threadsPerCore: Field<number>
    usable: number
    l2: Field<string>
    l3: Field<string>
    governor: Field<string>
    mitigations: Field<string>
  }>
  memory: Readonly<{
    totalGiB: Field<number>
    swapGiB: Field<number>
    transparentHugePages: Field<string>
    nodes: Field<number>
  }>
  virtualization: Readonly<{
    kind: Field<string>
    vendor: Field<string>
    product: Field<string>
    cpuLimit: Field<string>
    memoryLimit: Field<string>
  }>
  system: Readonly<{
    distribution: Field<string>
    kernel: Field<string>
    clockSource: Field<string>
    addressRandomization: Field<string>
  }>
  storage: Storage
  runtime: Runtime
}>

export type Storage = Readonly<{
  filesystem: Field<string>
  options: Field<string>
  deviceClass: Field<string>
  scheduler: Field<string>
}>

const digest = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16)

const gib = (kib: number): number => Math.round(kib / 1024 / 1024)

const meminfo =
  (key: string) =>
  (text: string): number | null => {
    const found = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)
    return found ? gib(Number(found[1])) : null
  }

function cpuOf(sources: Sources, usable: number): Machine['cpu'] {
  const info = sources.platform === 'linux' ? sources.read('/proc/cpuinfo') : null
  const none = unknown(
    sources.platform === 'linux' ? 'cannot read /proc/cpuinfo' : `not read on ${sources.platform}`,
  )
  const blocks = (info ?? '').split(/\n\n+/).filter(block => block.includes('processor'))
  const value = (block: string, key: string): string | null =>
    new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? null
  const sockets = new Set(blocks.map(block => value(block, 'physical id') ?? '0'))
  const cores = new Set(
    blocks.map(block => `${value(block, 'physical id') ?? '0'}/${value(block, 'core id') ?? ''}`),
  )
  const counted = info !== null && blocks.length > 0
  const cache = (index: number): Field<string> =>
    taken(sources, `/sys/devices/system/cpu/cpu0/cache/index${String(index)}/size`, trimmed)
  const flaws = '/sys/devices/system/cpu/vulnerabilities'
  const names = sources.platform === 'linux' ? sources.list(flaws) : null
  return {
    model: counted ? (value(blocks[0] ?? '', 'model name') ?? unknown('no model name')) : none,
    architecture: sources.architecture,
    sockets: counted ? sockets.size : none,
    cores: counted ? cores.size : none,
    threadsPerCore: counted ? blocks.length / cores.size : none,
    usable,
    l2: cache(2),
    l3: cache(3),
    governor: taken(sources, '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor', trimmed),
    mitigations:
      names === null
        ? unknown(`cannot list ${flaws}`)
        : digest(
            [...names]
              .sort()
              .map(name => `${name}=${sources.read(`${flaws}/${name}`)?.trim() ?? ''}`)
              .join('\n'),
          ),
  }
}

function virtualizationOf(sources: Sources): Machine['virtualization'] {
  const kind = sources.run('systemd-detect-virt', [])?.trim()
  const limit = (path: string): Field<string> => taken(sources, path, trimmed)
  return {
    kind: kind || unknown('systemd-detect-virt gave no answer'),
    vendor: taken(sources, '/sys/class/dmi/id/sys_vendor', trimmed),
    product: taken(sources, '/sys/class/dmi/id/product_name', trimmed),
    cpuLimit: limit('/sys/fs/cgroup/cpu.max'),
    memoryLimit: limit('/sys/fs/cgroup/memory.max'),
  }
}

function systemOf(sources: Sources): Machine['system'] {
  const release = (text: string): string | null => {
    const id = /^ID=(.+)$/m.exec(text)?.[1]?.replaceAll('"', '')
    const version = /^VERSION_ID=(.+)$/m.exec(text)?.[1]?.replaceAll('"', '')
    return id ? `${id} ${version ?? ''}`.trim() : null
  }
  return {
    distribution: taken(sources, '/etc/os-release', release),
    kernel: taken(
      sources,
      '/proc/sys/kernel/osrelease',
      text => /^(\d+\.\d+)/.exec(text)?.[1] ?? null,
    ),
    clockSource: taken(
      sources,
      '/sys/devices/system/clocksource/clocksource0/current_clocksource',
      trimmed,
    ),
    addressRandomization: taken(sources, '/proc/sys/kernel/randomize_va_space', trimmed),
  }
}

type Mount = Readonly<{ device: string; point: string; filesystem: string; options: string }>

function mountOf(sources: Sources, directory: string): Mount | null {
  const text = sources.read('/proc/self/mountinfo')
  if (text === null) return null
  let best: Mount | null = null
  for (const line of text.split('\n')) {
    const [left, right] = line.split(' - ')
    const fields = left?.split(' ') ?? []
    const point = fields[4]
    const device = fields[2]
    const filesystem = right?.split(' ')[0]
    if (point === undefined || device === undefined || filesystem === undefined) continue
    const inside = directory === point || directory.startsWith(point === '/' ? '/' : `${point}/`)
    if (inside && (best === null || point.length >= best.point.length))
      best = { device, point, filesystem, options: fields[5] ?? '' }
  }
  return best
}

const MEMORY_FILESYSTEMS = new Set(['tmpfs', 'ramfs', 'devtmpfs'])
const NETWORK_FILESYSTEMS = new Set(['nfs', 'nfs4', 'cifs', 'smb3', 'ceph', 'glusterfs', '9p'])

function deviceOf(sources: Sources, mount: Mount): Pick<Storage, 'deviceClass' | 'scheduler'> {
  if (MEMORY_FILESYSTEMS.has(mount.filesystem))
    return { deviceClass: 'memory', scheduler: unknown('no block device') }
  if (NETWORK_FILESYSTEMS.has(mount.filesystem))
    return { deviceClass: 'network', scheduler: unknown('no block device') }
  const node = sources.resolve(`/sys/dev/block/${mount.device}`)
  if (node === null)
    return {
      deviceClass: unknown('no block device behind the mount'),
      scheduler: unknown('no block device behind the mount'),
    }
  const queue = [node, node.slice(0, node.lastIndexOf('/'))].find(
    path => sources.read(`${path}/queue/rotational`) !== null,
  )
  if (queue === undefined)
    return {
      deviceClass: unknown('the device has no queue'),
      scheduler: unknown('the device has no queue'),
    }
  const name = queue.slice(queue.lastIndexOf('/') + 1)
  const rotational = sources.read(`${queue}/queue/rotational`)?.trim() === '1'
  return {
    deviceClass: name.startsWith('nvme') ? 'nvme' : rotational ? 'rotational' : 'solid-state',
    scheduler: taken(
      sources,
      `${queue}/queue/scheduler`,
      text => /\[(.+?)\]/.exec(text)?.[1] ?? trimmed(text),
    ),
  }
}

/** The filesystem and the device under one directory: the one the data of the measured object lives on. */
export function storageOf(sources: Sources, directory: string): Storage {
  const none = (reason: string): Storage => ({
    filesystem: unknown(reason),
    options: unknown(reason),
    deviceClass: unknown(reason),
    scheduler: unknown(reason),
  })
  if (sources.platform !== 'linux') return none(`not read on ${sources.platform}`)
  const real = sources.resolve(directory)
  if (real === null) return none('the data directory does not exist')
  const mount = mountOf(sources, real)
  if (mount === null) return none('cannot read /proc/self/mountinfo')
  return { filesystem: mount.filesystem, options: mount.options, ...deviceOf(sources, mount) }
}

export function machineOf(
  sources: Sources,
  input: Readonly<{ dataDirectory: string; usable: number; runtime: Runtime }>,
): Machine {
  const nodes = sources.platform === 'linux' ? sources.list('/sys/devices/system/node') : null
  return {
    cpu: cpuOf(sources, input.usable),
    memory: {
      totalGiB: taken(sources, '/proc/meminfo', meminfo('MemTotal')),
      swapGiB: taken(sources, '/proc/meminfo', meminfo('SwapTotal')),
      transparentHugePages: taken(
        sources,
        '/sys/kernel/mm/transparent_hugepage/enabled',
        text => /\[(.+?)\]/.exec(text)?.[1] ?? null,
      ),
      nodes:
        nodes === null
          ? unknown('cannot list /sys/devices/system/node')
          : nodes.filter(name => /^node\d+$/.test(name)).length,
    },
    virtualization: virtualizationOf(sources),
    system: systemOf(sources),
    storage: storageOf(sources, input.dataDirectory),
    runtime: input.runtime,
  }
}

/** Whether the data lives in memory, where a synchronous write costs nothing. */
export const onMemoryFilesystem = (machine: Machine): boolean =>
  machine.storage.deviceClass === 'memory'
