import {
  genericItem,
  judgeMember,
  memberDigest,
  reasonText,
  type Absent,
  type PointRules,
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
  | Readonly<{ kind: 'point'; rules: PointRules }>
  | Readonly<{ kind: 'category'; takes: 'data' | 'directory'; place(what: unknown): unknown }>

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
  lockedBy?(point: string, key: string, id: string): string | undefined
  within?<T>(run: () => T): T
}>

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
const failed = (reason: string): Outcome => ({ kind: 'failed', reason })

type Pending = Readonly<{
  member: ModuleMember
  file: PackageFile
  form: GuestForm | undefined
  rules: PointRules
}>

type Step =
  | Readonly<{ kind: 'item'; item: unknown }>
  | Readonly<{ kind: 'code'; pending: Pending }>
  | Readonly<{ kind: 'absent'; absent: Absent }>
  | Readonly<{ kind: 'refused'; reason: string }>

const refused = (reason: string): Step => ({ kind: 'refused', reason })

function placed(place: (what: unknown) => unknown, what: unknown): Step {
  try {
    return { kind: 'item', item: place(what) }
  } catch (error) {
    return refused(reasonOf(error))
  }
}

function stepOf(ports: ServerInstallPorts, member: Member, files: readonly PackageFile[]): Step {
  const point = ports.point(member.point)
  const form = point?.kind === 'point' ? ports.guestForm(member.point) : undefined
  const judged = judgeMember(
    point === undefined
      ? { kind: 'absent' }
      : point.kind === 'category'
        ? { kind: 'category', takes: point.takes }
        : { kind: 'point', rules: point.rules, form: form !== undefined },
    member,
  )
  if (judged.kind === 'not')
    return judged.reason.kind === 'absent'
      ? { kind: 'absent', absent: judged.reason.absent }
      : refused(reasonText(judged.reason))
  if (point?.kind === 'category')
    return placed(
      point.place,
      'directory' in member ? member.directory : 'data' in member ? member.data : undefined,
    )
  if (point === undefined || !('module' in member))
    return { kind: 'item', item: 'data' in member ? member.data : undefined }
  const file = files.find(each => each.path === member.module)
  if (file === undefined) return refused(`the package has no file ${member.module}`)
  return { kind: 'code', pending: { member, file, form, rules: point.rules } }
}

const lockedStep = (lock: string): Step =>
  refused(
    `the key is locked by ${lock}: an entry of the deployment holds it and a tenant cannot replace it`,
  )

/** The code of a plugin is handed the ports alone: no context, no service, nothing of the host. */
const HOST = Object.freeze({ ports: Object.freeze({}) })

async function madeBy(
  ports: ServerInstallPorts,
  pending: Pending,
  bind: GuestContext['bind'],
): Promise<unknown> {
  const { member, file, form, rules } = pending
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
  if (form === undefined) {
    const made = genericItem(rules, given)
    if ('kind' in made) throw new Error(reasonText(made))
    return made.item
  }
  try {
    return form(given, { key: member.key, bind, ...(within !== undefined && { within }) })
  } catch (error) {
    throw new Error(`the point refused what ${member.export} made: ${reasonOf(error)}`)
  }
}

const uniqueOf = (lacks: readonly Absent[]): readonly Absent[] =>
  lacks.filter(
    (lack, index) =>
      lacks.findIndex(other => other.kind === lack.kind && other.name === lack.name) === index,
  )

/** Puts what one plugin writes for the server, in the scope of the tenant that holds it: all of its members, or none. */
export function serverInstall(ports: ServerInstallPorts): (wanted: Wanted) => Promise<Outcome> {
  return async ({ members, needs, files }) => {
    const needed = ports.needs(needs)
    const places = members.map(member => `${member.point}\n${member.key}`)
    const steps = members.map((member, index): Step => {
      const twice = places.indexOf(places[index] ?? '') !== index
      const lock = ports.lockedBy?.(member.point, member.key, member.id ?? '')
      if (twice) return refused('another member of this plugin is at the same place')
      return lock === undefined ? stepOf(ports, member, files) : lockedStep(lock)
    })
    const labelOf = (index: number): string =>
      `member ${index + 1} (${members[index]?.point} ${members[index]?.key})`
    const broken = steps.findIndex(step => step.kind === 'refused')
    const refusal = steps[broken]
    if (refusal?.kind === 'refused') return failed(`${labelOf(broken)}: ${refusal.reason}`)
    const lacks = [
      ...(needed.kind === 'missing'
        ? needed.names.map(name => ({ kind: 'port' as const, name }))
        : []),
      ...steps.flatMap(step => (step.kind === 'absent' ? [step.absent] : [])),
    ]
    if (lacks.length > 0 || needed.kind === 'missing')
      return { kind: 'waiting', lacks: uniqueOf(lacks) }
    const entries: ServerEntry[] = []
    for (const [index, member] of members.entries()) {
      const label = labelOf(index)
      const step = steps[index]
      if (step?.kind !== 'item' && step?.kind !== 'code') continue
      const made =
        step.kind === 'item'
          ? step
          : await madeBy(ports, step.pending, needed.bind).then(item => ({ item }), reasonOf)
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
