import type { Probe, Runtime, Sources } from '../src/index.ts'

export const HOST = 'ip-10-9-8-7-build-box'
export const USER = 'ada-lovelace'
export const HOME = `/home/${USER}`
export const ADDRESS = '10.9.8.7'

const CPU = (processor: number, core: number): string =>
  [
    `processor\t: ${String(processor)}`,
    'model name\t: Example CPU @ 2.50GHz',
    'physical id\t: 0',
    `core id\t\t: ${String(core)}`,
    'microcode\t: 0x2007006',
  ].join('\n')

const FILES: Readonly<Record<string, string>> = {
  '/proc/cpuinfo': [CPU(0, 0), CPU(1, 1), CPU(2, 0), CPU(3, 1)].join('\n\n') + '\n',
  '/sys/devices/system/cpu/cpu0/cache/index2/size': '1024K\n',
  '/sys/devices/system/cpu/cpu0/cache/index3/size': '33792K\n',
  '/sys/devices/system/cpu/vulnerabilities/meltdown': 'Mitigation: PTI\n',
  '/sys/devices/system/cpu/vulnerabilities/spectre_v2': 'Mitigation: Retpolines\n',
  '/proc/meminfo':
    'MemTotal:       32000000 kB\nMemAvailable:   16000000 kB\nSwapTotal:             0 kB\n',
  '/sys/kernel/mm/transparent_hugepage/enabled': 'always [madvise] never\n',
  '/sys/class/dmi/id/sys_vendor': 'Example Cloud\n',
  '/sys/class/dmi/id/product_name': 'x5.large\n',
  '/sys/fs/cgroup/cpu.max': 'max 100000\n',
  '/sys/fs/cgroup/memory.max': 'max\n',
  '/etc/os-release': 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="20.04"\n',
  '/etc/hostname': `${HOST}\n`,
  '/proc/sys/kernel/osrelease': '5.15.0-1084-aws\n',
  '/proc/sys/kernel/hostname': `${HOST}\n`,
  '/sys/devices/system/clocksource/clocksource0/current_clocksource': 'tsc\n',
  '/proc/sys/kernel/randomize_va_space': '2\n',
  '/proc/self/mountinfo': [
    '29 1 259:1 / / rw,relatime shared:1 - ext4 /dev/root rw,discard',
    `90 29 259:3 / ${HOME} rw,noatime shared:2 - ext4 /dev/nvme1n1p1 rw`,
    '95 29 0:40 / /dev/shm rw,nosuid,nodev shared:4 - tmpfs tmpfs rw',
    `97 29 0:55 / /mnt/share rw shared:5 - nfs ${ADDRESS}:/export rw,addr=${ADDRESS}`,
  ].join('\n'),
  '/sys/devices/pci0000:00/nvme/nvme1/nvme1n1/queue/rotational': '0\n',
  '/sys/devices/pci0000:00/nvme/nvme1/nvme1n1/queue/scheduler': '[none] mq-deadline\n',
}

const LISTS: Readonly<Record<string, readonly string[]>> = {
  '/sys/devices/system/cpu/vulnerabilities': ['spectre_v2', 'meltdown'],
  '/sys/devices/system/node': ['node0', 'possible', 'online'],
  '/sys/devices/system/cpu': ['cpu0', 'cpu1', 'cpufreq'],
}

const LINKS: Readonly<Record<string, string>> = {
  '/sys/dev/block/259:3': '/sys/devices/pci0000:00/nvme/nvme1/nvme1n1/nvme1n1p1',
}

/** A machine a test describes. Its name, its user, the home and an address sit where a careless reader would pick them up. */
export function described(over: Readonly<Record<string, string | null>> = {}): Sources {
  const files: Record<string, string | null> = { ...FILES, ...over }
  return {
    platform: 'linux',
    architecture: 'x64',
    read: path => files[path] ?? null,
    list: path => LISTS[path] ?? null,
    resolve: path => LINKS[path] ?? (path.startsWith('/sys/') ? null : path),
    run: command => (command === 'systemd-detect-virt' ? 'kvm\n' : null),
    used: () => 0.5,
  }
}

export const RUNTIME: Runtime = {
  node: '26.13.1',
  v8: '14.2',
  sqlite: '3.54.0',
  sqliteOptions: 'aaaaaaaaaaaaaaaa',
  heapOptions: [],
  threadPool: 4,
}

export const DATA = `${HOME}/work/data`

export const steady: Probe = {
  computeMs: 20,
  syncWrite: { medianMs: 1, highMs: 2 },
  commit: { medianMs: 1.5, highMs: 3 },
}
