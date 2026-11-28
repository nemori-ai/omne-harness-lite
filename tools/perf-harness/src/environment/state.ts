import { isUnknown, unknown, type Field, type Sources } from './field.ts'

type Processor = Readonly<{ total: number; busy: number; steal: number; waiting: number }>

export type Moment = Readonly<{
  at: string
  load: readonly [number, number, number]
  processor: Field<Processor>
  own: Field<number>
  availableMiB: Field<number>
  swapped: Field<number>
  throttles: Field<number>
  processes: ReadonlyMap<number, Readonly<{ name: string; parent: number; ticks: number }>>
}>

const numbers = (text: string): number[] => text.trim().split(/\s+/).map(Number)

function processorOf(sources: Sources): Field<Processor> {
  const line = sources.read('/proc/stat')?.split('\n')[0]
  if (line === undefined) return unknown('cannot read /proc/stat')
  const [user = 0, nice = 0, system = 0, idle = 0, waiting = 0, irq = 0, soft = 0, steal = 0] =
    numbers(line.replace(/^cpu\s+/, ''))
  const busy = user + nice + system + irq + soft
  return { total: busy + idle + waiting + steal, busy, steal, waiting }
}

function statOf(text: string): Readonly<{ name: string; rest: number[] }> | null {
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open < 0 || close < open) return null
  return {
    name: text.slice(open + 1, close),
    rest: numbers(text.slice(close + 1).replace(/^\s*\S+/, '')),
  }
}

function processesOf(sources: Sources): Moment['processes'] {
  const found = new Map<number, { name: string; parent: number; ticks: number }>()
  for (const entry of sources.list('/proc') ?? []) {
    if (!/^\d+$/.test(entry)) continue
    const stat = statOf(sources.read(`/proc/${entry}/stat`) ?? '')
    if (stat === null) continue
    found.set(Number(entry), {
      name: stat.name,
      parent: stat.rest[0] ?? 0,
      ticks: (stat.rest[10] ?? 0) + (stat.rest[11] ?? 0),
    })
  }
  return found
}

const counted =
  (key: string) =>
  (text: string | null): number | null => {
    const found = text === null ? null : new RegExp(`^${key}:?\\s+(\\d+)`, 'm').exec(text)
    return found ? Number(found[1]) : null
  }

function throttlesOf(sources: Sources): Field<number> {
  const cpus = (sources.list('/sys/devices/system/cpu') ?? []).filter(name => /^cpu\d+$/.test(name))
  const counts = cpus
    .map(cpu => sources.read(`/sys/devices/system/cpu/${cpu}/thermal_throttle/core_throttle_count`))
    .filter(text => text !== null)
  if (counts.length === 0) return unknown('the machine reports no thermal throttling')
  return counts.reduce((sum, text) => sum + Number(text.trim()), 0)
}

export function momentOf(
  sources: Sources,
  at: Date,
  load: readonly [number, number, number],
): Moment {
  if (sources.platform !== 'linux') {
    const none = unknown(`not read on ${sources.platform}`)
    return {
      at: at.toISOString(),
      load,
      processor: none,
      own: none,
      availableMiB: none,
      swapped: none,
      throttles: none,
      processes: new Map(),
    }
  }
  const own = statOf(sources.read('/proc/self/stat') ?? '')
  const available = counted('MemAvailable')(sources.read('/proc/meminfo'))
  const vmstat = sources.read('/proc/vmstat')
  const swapIn = counted('pswpin')(vmstat)
  const swapOut = counted('pswpout')(vmstat)
  return {
    at: at.toISOString(),
    load,
    processor: processorOf(sources),
    own:
      own === null
        ? unknown('cannot read /proc/self/stat')
        : [10, 11, 12, 13].reduce((sum, index) => sum + (own.rest[index] ?? 0), 0),
    availableMiB:
      available === null ? unknown('cannot read /proc/meminfo') : Math.round(available / 1024),
    swapped:
      swapIn === null || swapOut === null ? unknown('cannot read /proc/vmstat') : swapIn + swapOut,
    throttles: throttlesOf(sources),
    processes: processesOf(sources),
  }
}

export type State = Readonly<{
  startedAt: string
  endedAt: string
  loadBefore: readonly [number, number, number]
  loadAfter: readonly [number, number, number]
  othersShare: Field<number>
  stolenShare: Field<number>
  waitingShare: Field<number>
  availableMiB: Field<number>
  availableLowMiB: Field<number>
  swappedPages: Field<number>
  throttles: Field<number>
  diskUsedShare: Field<number>
  heldSlot: boolean
  busiest: readonly string[]
}>

const BUSIEST = 3

function busiestOf(first: Moment, last: Moment, self: number): string[] {
  const mine = (pid: number): boolean => {
    for (let at = pid, hops = 0; at > 1 && hops < 64; hops += 1) {
      if (at === self) return true
      at = last.processes.get(at)?.parent ?? 0
    }
    return false
  }
  return [...last.processes]
    .filter(([pid]) => !mine(pid))
    .map(([pid, process]) => ({
      name: process.name,
      ticks: process.ticks - (first.processes.get(pid)?.ticks ?? 0),
    }))
    .filter(process => process.ticks > 0)
    .sort((a, b) => b.ticks - a.ticks || (a.name < b.name ? -1 : 1))
    .slice(0, BUSIEST)
    .map(process => process.name)
}

const between = <T>(a: Field<T>, b: Field<T>, of: (a: T, b: T) => Field<number>): Field<number> =>
  isUnknown(a) ? a : isUnknown(b) ? b : of(a, b)

export function stateBetween(
  first: Moment,
  last: Moment,
  input: Readonly<{
    self: number
    availableLowMiB: Field<number>
    diskUsedShare: Field<number>
    heldSlot: boolean
  }>,
): State {
  const share = (pick: (processor: Processor) => number): Field<number> =>
    between(first.processor, last.processor, (a, b) =>
      b.total === a.total
        ? unknown('no processor time passed')
        : (pick(b) - pick(a)) / (b.total - a.total),
    )
  const own = between(first.own, last.own, (a, b) => b - a)
  const busy = share(processor => processor.busy)
  const total = between(first.processor, last.processor, (a, b) => b.total - a.total)
  return {
    startedAt: first.at,
    endedAt: last.at,
    loadBefore: first.load,
    loadAfter: last.load,
    othersShare:
      isUnknown(busy) || isUnknown(own) || isUnknown(total)
        ? isUnknown(busy)
          ? busy
          : unknown('the processor time of this run is not known')
        : Math.max(0, busy - own / total),
    stolenShare: share(processor => processor.steal),
    waitingShare: share(processor => processor.waiting),
    availableMiB: first.availableMiB,
    availableLowMiB: input.availableLowMiB,
    swappedPages: between(first.swapped, last.swapped, (a, b) => b - a),
    throttles: between(first.throttles, last.throttles, (a, b) => b - a),
    diskUsedShare: input.diskUsedShare,
    heldSlot: input.heldSlot,
    busiest: busiestOf(first, last, input.self),
  }
}
