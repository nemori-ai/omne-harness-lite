import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { homedir, networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assemblyIdOf,
  besideOf,
  canonical,
  checkoutOf,
  configIdOf,
  fitnessOf,
  hostSources,
  idsOf,
  isUnknown,
  machineOf,
  onMemoryFilesystem,
  probe,
  watch,
  workloadIdOf,
  type Environment,
  type State,
} from '../src/index.ts'
import { ADDRESS, DATA, described, HOME, HOST, RUNTIME, steady, USER } from './machine.ts'

const machine = (over: Readonly<Record<string, string | null>> = {}, directory = DATA) =>
  machineOf(described(over), { dataDirectory: directory, usable: 4, runtime: RUNTIME })

describe('the identity of a machine', () => {
  it('reads what decides the cost of the work', () => {
    expect(machine()).toMatchObject({
      cpu: {
        model: 'Example CPU @ 2.50GHz',
        architecture: 'x64',
        sockets: 1,
        cores: 2,
        threadsPerCore: 2,
        usable: 4,
        l2: '1024K',
        l3: '33792K',
      },
      memory: { totalGiB: 31, swapGiB: 0, transparentHugePages: 'madvise', nodes: 1 },
      virtualization: { kind: 'kvm', vendor: 'Example Cloud', product: 'x5.large' },
      system: {
        distribution: 'ubuntu 20.04',
        kernel: '5.15',
        clockSource: 'tsc',
        addressRandomization: '2',
      },
      storage: {
        filesystem: 'ext4',
        options: 'rw,noatime',
        deviceClass: 'nvme',
        scheduler: 'none',
      },
    })
  })

  it('gives one identifier to one machine read twice', () => {
    expect(configIdOf(machine())).toBe(configIdOf(machine()))
    expect(configIdOf(machine())).toMatch(/^cfg-[0-9a-f]{12}$/)
  })

  it('gives this machine the same identifier twice in a row', () => {
    const read = () =>
      machineOf(hostSources, { dataDirectory: tmpdir(), usable: 4, runtime: RUNTIME })
    expect(configIdOf(read())).toBe(configIdOf(read()))
  })

  it('gives another identifier once a single field of the identity differs', () => {
    const base = configIdOf(machine())
    expect(configIdOf(machine({ '/proc/sys/kernel/randomize_va_space': '0\n' }))).not.toBe(base)
    expect(
      configIdOf(machine({ '/sys/devices/system/cpu/vulnerabilities/meltdown': 'Vulnerable\n' })),
    ).not.toBe(base)
    expect(configIdOf(machine({}, '/dev/shm/data'))).not.toBe(base)
    expect(
      configIdOf(
        machineOf(described(), {
          dataDirectory: DATA,
          usable: 4,
          runtime: { ...RUNTIME, node: '26.12.0' },
        }),
      ),
    ).not.toBe(base)
  })

  it('keeps the full kernel release and the microcode beside the identity, out of the identifier', () => {
    const sources = described({ '/proc/sys/kernel/osrelease': '5.15.0-9999-aws\n' })
    expect(besideOf(sources)).toEqual({ kernelRelease: '5.15.0-9999-aws', microcode: '0x2007006' })
    expect(configIdOf(machine({ '/proc/sys/kernel/osrelease': '5.15.0-9999-aws\n' }))).toBe(
      configIdOf(machine()),
    )
  })

  it('writes a field it cannot take as unknown with the reason, never as empty or as a guess', () => {
    const read = machine({ '/proc/cpuinfo': null })
    expect(read.cpu.governor).toEqual({
      unknown: 'cannot read /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
    })
    expect(read.cpu.model).toEqual({ unknown: 'cannot read /proc/cpuinfo' })
    expect(read.cpu.cores).toEqual({ unknown: 'cannot read /proc/cpuinfo' })
    expect(isUnknown(machine({}, '/nowhere/../x').storage.filesystem)).toBe(false)
  })

  it('takes nothing of a machine that is not Linux, and says so', () => {
    const elsewhere = machineOf(
      { ...described(), platform: 'darwin' },
      { dataDirectory: DATA, usable: 4, runtime: RUNTIME },
    )
    expect(elsewhere.memory.totalGiB).toEqual({ unknown: 'not read on darwin' })
    expect(elsewhere.storage.filesystem).toEqual({ unknown: 'not read on darwin' })
    expect(elsewhere.runtime).toEqual(RUNTIME)
  })

  it('tells the device under the data apart: memory, network, a disk', () => {
    expect(machine({}, '/dev/shm/data').storage).toMatchObject({
      filesystem: 'tmpfs',
      deviceClass: 'memory',
    })
    expect(machine({}, '/mnt/share/data').storage).toMatchObject({ deviceClass: 'network' })
    expect(isUnknown(machine({}, '/var/data').storage.deviceClass)).toBe(true)
    expect(onMemoryFilesystem(machine({}, '/dev/shm/data'))).toBe(true)
    expect(onMemoryFilesystem(machine())).toBe(false)
  })

  it('carries no name of the machine, no user, no home path and no address', () => {
    const text = JSON.stringify({ machine: machine(), beside: besideOf(described()) })
    for (const secret of [HOST, USER, HOME, ADDRESS]) expect(text).not.toContain(secret)
    const shared = JSON.stringify(machine({}, '/mnt/share/data'))
    expect(shared).not.toContain(ADDRESS)
  })
})

describe('the three identifiers', () => {
  it('do not depend on the order the keys were written in', () => {
    expect(canonical({ b: [1, { d: 1, c: 2 }], a: null })).toBe('{"a":null,"b":[1,{"c":2,"d":1}]}')
    expect(workloadIdOf({ seed: 1, steps: 45 })).toBe(workloadIdOf({ steps: 45, seed: 1 }))
  })

  it('are three: the question, the assembly, the machine', () => {
    const ids = idsOf({
      machine: machine(),
      subject: {
        commit: 'abc',
        dirty: false,
        release: true,
        assembly: { synchronous: 'full' },
        workload: { steps: 45 },
      },
    })
    expect(ids.workload).toMatch(/^wl-/)
    expect(ids.assembly).toBe(assemblyIdOf({ synchronous: 'full' }))
    expect(ids.config).toMatch(/^cfg-/)
    expect(assemblyIdOf({ synchronous: 'normal' })).not.toBe(ids.assembly)
  })
})

const quiet: State = {
  startedAt: '2026-11-27T00:00:00.000Z',
  endedAt: '2026-11-27T00:01:00.000Z',
  loadBefore: [0.2, 0.2, 0.2],
  loadAfter: [1, 0.5, 0.3],
  othersShare: 0.01,
  stolenShare: 0,
  waitingShare: 0,
  availableMiB: 16000,
  availableLowMiB: 15000,
  swappedPages: 0,
  throttles: { unknown: 'the machine reports no thermal throttling' },
  diskUsedShare: 0.5,
  heldSlot: true,
  busiest: [],
}

const environment = (over: Partial<Environment> = {}): Environment => ({
  machine: machine(),
  beside: {},
  subject: { commit: 'abc', dirty: false, release: true, assembly: {}, workload: {} },
  state: quiet,
  probes: { first: steady, last: steady },
  ...over,
})

describe('whether the times of a result can be trusted', () => {
  it('trusts a quiet run on the pinned runtime, on a disk', () => {
    expect(fitnessOf(environment(), '26.13.1')).toEqual({
      times: 'fit',
      baseline: 'fit',
      stateQualified: true,
      probesHold: null,
      reasons: [],
    })
  })

  it('blocks the times when the data is on a memory filesystem', () => {
    const fitness = fitnessOf(environment({ machine: machine({}, '/dev/shm/data') }), '26.13.1')
    expect(fitness).toMatchObject({ times: 'blocked', baseline: 'blocked', stateQualified: false })
    expect(fitness.reasons[0]).toContain('memory filesystem')
  })

  it('blocks the times when Node is not the pinned one', () => {
    const fitness = fitnessOf(environment(), '26.99.0')
    expect(fitness).toMatchObject({ times: 'blocked', baseline: 'blocked' })
    expect(fitness.reasons).toEqual(['Node 26.13.1 is not the pinned 26.99.0'])
  })

  it('does not qualify a state whose probes moved, that began loaded, or that lost time to the host', () => {
    const slower = { ...steady, computeMs: steady.computeMs * 1.2 }
    const moved = fitnessOf(environment({ probes: { first: steady, last: slower } }), '26.13.1')
    expect(moved).toMatchObject({ times: 'fit', baseline: 'blocked', stateQualified: false })
    expect(moved.reasons).toEqual(['the probes moved during the run: compute'])
    const loaded = environment({ state: { ...quiet, loadBefore: [1.5, 1, 1] } })
    expect(fitnessOf(loaded, '26.13.1').stateQualified).toBe(false)
    const stolen = environment({ state: { ...quiet, stolenShare: 0.05 } })
    expect(fitnessOf(stolen, '26.13.1').stateQualified).toBe(false)
    const within = { ...steady, computeMs: steady.computeMs * 1.05 }
    expect(
      fitnessOf(environment({ probes: { first: steady, last: within } }), '26.13.1').stateQualified,
    ).toBe(true)
  })

  it('holds the probes against the baseline of the machine when there is one', () => {
    const drifted = { ...steady, commit: { medianMs: 2, highMs: 3 } }
    expect(fitnessOf(environment(), '26.13.1', steady).probesHold).toBe(true)
    const fitness = fitnessOf(environment(), '26.13.1', drifted)
    expect(fitness.probesHold).toBe(false)
    expect(fitness.reasons).toEqual([
      'the probes drifted from the baseline of this machine: commit',
    ])
  })

  it('keeps a result of a tree that is dirty, or not known to be clean, out of the baseline', () => {
    for (const dirty of [true, { unknown: 'git status did not run' }]) {
      const subject = { ...environment().subject, dirty }
      expect(fitnessOf(environment({ subject }), '26.13.1')).toMatchObject({
        times: 'fit',
        baseline: 'blocked',
        stateQualified: true,
      })
    }
  })
})

describe('on this machine', () => {
  it('probes a directory and watches a run, and leaves nothing behind', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'perf-harness-')))
    try {
      const settings = { journalMode: 'wal', synchronous: 'full' }
      const watching = watch(hostSources, { dataDirectory: directory, settings })
      await new Promise(resolve => setTimeout(resolve, 20))
      const { state, last } = watching.end()
      expect(watching.first.computeMs).toBeGreaterThan(0)
      expect(last.commit).toMatchObject({
        medianMs: expect.any(Number),
        highMs: expect.any(Number),
      })
      expect(last.syncWrite).toMatchObject({ medianMs: expect.any(Number) })
      expect(Date.parse(state.endedAt)).toBeGreaterThanOrEqual(Date.parse(state.startedAt))
      expect(hostSources.list(directory)).toEqual([])
      const text = JSON.stringify({
        machine: watching.machine,
        state,
        beside: besideOf(hostSources),
      })
      expect(text).not.toContain(homedir())
      expect(text).not.toContain(directory)
      for (const address of Object.values(networkInterfaces()).flat())
        if (address && !address.internal) expect(text).not.toContain(address.address)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('answers unknown for a probe that cannot write, and refuses a setting that is not a plain word', () => {
    const nowhere = probe('/nonexistent/perf-harness', { journalMode: 'wal', synchronous: 'full' })
    expect(nowhere.syncWrite).toEqual({ unknown: 'cannot write in the data directory' })
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'perf-harness-')))
    try {
      expect(probe(directory, { journalMode: 'wal; drop', synchronous: 'full' }).commit).toEqual({
        unknown: 'TypeError',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reads the commit of a checkout, and says unknown outside one', () => {
    expect(checkoutOf(hostSources, process.cwd()).commit).toMatch(/^[0-9a-f]{40}$/)
    expect(checkoutOf(described(), '/x')).toEqual({
      commit: { unknown: 'not a Git checkout' },
      dirty: { unknown: 'git status did not run' },
    })
  })
})
