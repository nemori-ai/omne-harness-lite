import {
  memberDigest,
  type Bound,
  type Member,
  type ModuleMember,
  type Outcome,
  type PackageFile,
  type Wanted,
} from '@omne-harness/plugin-protocol'

export type ServerEntry = Readonly<{
  point: string
  key: string
  id: string
  scope: readonly string[]
  rank: number
  digest: string
  item: unknown
}>

/** What a point of the server tree is to a plugin: how a member of it is written and when, or that a category owns it. */
export type ServerPoint =
  | Readonly<{ kind: 'takes'; takes: 'data' | 'code'; when: 'running' | 'build' }>
  | Readonly<{ kind: 'category'; place(directory: string): unknown }>

export type GuestContext = Readonly<{
  key: string
  bind: (principal: unknown) => Bound
  within?: <T>(run: () => T) => T
}>

/** What the owner of a point makes of what the code of a plugin gave: the item the point holds. It throws on what it cannot take. */
export type GuestForm = (made: unknown, context: GuestContext) => unknown

export type Needed =
  | Readonly<{ kind: 'adopted'; bind: (principal: unknown) => Bound }>
  | Readonly<{ kind: 'missing'; names: readonly string[] }>

export type ServerInstallPorts = Readonly<{
  /** The scope of the tenant that holds the plugin. The loader stamps it; a manifest cannot write one. */
  scope: readonly string[]
  point(name: string): ServerPoint | undefined
  guestForm(point: string): GuestForm | undefined
  needs(names: readonly string[]): Needed
  load(file: PackageFile): Promise<unknown>
  /** Puts the entries as this plugin; the answer takes them back. It rejects when the registry refuses them. */
  put(entries: readonly ServerEntry[]): Promise<() => unknown>
  lockedBy?(point: string, key: string): string | undefined
  within?<T>(run: () => T): T
}>

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
const failed = (reason: string): Outcome => ({ kind: 'failed', reason })
const ABSENT = ' is not a point now'
const WAY = { data: 'data', directory: 'a directory', module: 'code' } as const
const wayOf = (member: Member): keyof typeof WAY =>
  'module' in member ? 'module' : 'directory' in member ? 'directory' : 'data'

type Pending = Readonly<{ member: ModuleMember; file: PackageFile; form: GuestForm }>

function stepOf(
  ports: ServerInstallPorts,
  member: Member,
  files: readonly PackageFile[],
): Readonly<{ item: unknown }> | Pending | string {
  const point = ports.point(member.point)
  if (point === undefined) return `${member.point}${ABSENT}`
  const way = wayOf(member)
  if (point.kind === 'category') {
    if (!('directory' in member))
      return `the point of a category takes a directory; this member gives ${WAY[way]}`
    try {
      return { item: point.place(member.directory) }
    } catch (error) {
      return reasonOf(error)
    }
  }
  const taken = point.takes === 'code' ? 'module' : 'data'
  if (way !== taken) return `the point takes ${WAY[taken]}; this member gives ${WAY[way]}`
  if (point.when === 'build') return 'the point is fixed when the application is built'
  if (!('module' in member)) return { item: 'data' in member ? member.data : undefined }
  const form = ports.guestForm(member.point)
  if (form === undefined) return 'the point takes no code from a plugin'
  const file = files.find(each => each.path === member.module)
  return file === undefined ? `the package has no file ${member.module}` : { member, file, form }
}

/** The code of a plugin is handed the ports alone: no context, no service, nothing of the host. */
const HOST = Object.freeze({ ports: Object.freeze({}) })

async function madeBy(
  ports: ServerInstallPorts,
  pending: Pending,
  bind: GuestContext['bind'],
): Promise<unknown> {
  const { member, file, form } = pending
  const within = ports.within === undefined ? undefined : ports.within.bind(ports)
  const traced = <T>(run: () => T): T => (within === undefined ? run() : within(run))
  const loaded = await traced(() => ports.load(file)).catch((error: unknown) => {
    throw new Error(`${file.path} could not be loaded: ${reasonOf(error)}`)
  })
  const made = (loaded as Readonly<Record<string, unknown>> | null)?.[member.export]
  if (typeof made !== 'function')
    throw new Error(`${file.path} exports no function named ${member.export}`)
  let given: unknown
  try {
    given = traced(() => (made as (host: typeof HOST) => unknown)(HOST))
  } catch (error) {
    throw new Error(`${member.export} threw: ${reasonOf(error)}`)
  }
  try {
    return form(given, { key: member.key, bind, ...(within !== undefined && { within }) })
  } catch (error) {
    throw new Error(`the point refused what ${member.export} made: ${reasonOf(error)}`)
  }
}

/** Puts what one plugin writes for the server, in the scope of the tenant that holds it: all of its members, or none. */
export function serverInstall(ports: ServerInstallPorts): (wanted: Wanted) => Promise<Outcome> {
  return async ({ members, needs, files }) => {
    const needed = ports.needs(needs)
    const places = members.map(member => `${member.point}\n${member.key}`)
    const steps = members.map((member, index) => {
      const twice = places.indexOf(places[index] ?? '') !== index
      const lock = ports.lockedBy?.(member.point, member.key)
      return twice
        ? 'another member of this plugin is at the same place'
        : lock !== undefined
          ? `the key is locked by ${lock}: an entry of the deployment holds it and a tenant cannot replace it`
          : stepOf(ports, member, files)
    })
    const labelOf = (index: number): string =>
      `member ${index + 1} (${members[index]?.point} ${members[index]?.key})`
    const broken = steps.findIndex(step => typeof step === 'string' && !step.endsWith(ABSENT))
    if (broken >= 0) return failed(`${labelOf(broken)}: ${steps[broken] as string}`)
    const lacks = [
      ...(needed.kind === 'missing' ? needed.names.map(name => `port ${name}`) : []),
      ...members.flatMap((member, index) =>
        typeof steps[index] === 'string' ? [`point ${member.point}`] : [],
      ),
    ]
    if (lacks.length > 0 || needed.kind === 'missing')
      return { kind: 'waiting', lacks: [...new Set(lacks)] }
    const entries: ServerEntry[] = []
    for (const [index, member] of members.entries()) {
      const label = labelOf(index)
      const step = steps[index] as Exclude<(typeof steps)[number], string>
      const made =
        'item' in step
          ? step
          : await madeBy(ports, step, needed.bind).then(item => ({ item }), reasonOf)
      if (typeof made === 'string') return failed(`${label}: ${made}`)
      entries.push({
        point: member.point,
        key: member.key,
        id: member.id ?? '',
        scope: ports.scope,
        rank: member.rank ?? 0,
        digest: memberDigest(member, files),
        item: made.item,
      })
    }
    if (entries.length === 0) return { kind: 'installed', remove: () => undefined }
    try {
      return { kind: 'installed', remove: await ports.put(entries) }
    } catch (error) {
      return failed(`the registry refused it: ${reasonOf(error)}`)
    }
  }
}
