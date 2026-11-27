import {
  fiberOf,
  genericItem,
  insidePackage,
  judgeMember,
  reasonText,
  type Absent,
  type Listed,
  type Member,
  type ModuleMember,
  type Outcome,
  type PointRules,
} from '@omne-harness/plugin-protocol'
import {
  needProtocol,
  protocolClientOf,
  type Changes,
  type ClientGuestForm,
  type Described,
  type Hosted,
  type ScopeSource,
  type Toast,
} from '@omne-harness/shell-contract'

/** How the application loads the code of a plugin, and what it hands that code beside the shell. */
export type Code = Readonly<{
  load: (name: string, version: string, path: string) => Promise<unknown>
  given: Readonly<Record<string, unknown>>
  files?: (name: string, version: string) => string
}>

type Scope = readonly string[]

export type InstallShell = Readonly<{
  described(): Described
  guestForm(point: string): ClientGuestForm | undefined
  changesFor(asker: Scope): Changes
  host(name: string, apply: (inside: InstallShell) => void): Promise<Hosted>
  putItem(
    spot: Readonly<{ point: string; key: string; id?: string; rank?: number }>,
    item: object,
    scope?: Scope,
    code?: boolean,
  ): () => unknown
  navigate(page: string, subject?: string): void
  toast(toast: Toast): void
  scope: Pick<ScopeSource, 'get' | 'subscribe'>
  registry: Parameters<typeof protocolClientOf>[0]
}>

type Put = (shell: InstallShell) => void
type Fault = Readonly<{ reason: string; absent?: Absent }>

const ONE_ITEM = 'the point holds one item for a key, so a member writes no id and no rank'

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** What the code of a plugin may do with the shell: nothing that puts. Putting stays with the loader. */
const guestOf = (shell: InstallShell): object =>
  Object.freeze({
    navigate: (page: string, subject?: string) => shell.navigate(page, subject),
    toast: (toast: Toast) => shell.toast(toast),
    scope: Object.freeze({
      get: () => shell.scope.get(),
      subscribe: (listener: (scope: string | undefined) => void) => shell.scope.subscribe(listener),
    }),
  })

type Pending = Readonly<{
  member: ModuleMember
  code: Code
  rules: PointRules
  ports: object
  form?: ClientGuestForm
}>

type Step =
  | Readonly<{ kind: 'put'; put: Put }>
  | Readonly<{ kind: 'code'; pending: Pending }>
  | Readonly<{ kind: 'fault'; fault: Fault }>

const refused = (reason: string): Step => ({ kind: 'fault', fault: { reason } })

type Asked = Readonly<{
  shell: InstallShell
  points: ReadonlyMap<string, PointRules & Readonly<{ arity: string; resolve: string }>>
  skin: boolean
  scope: Scope
  code: Code | undefined
  files: string | undefined
  ports: object
}>

const spotOf = ({ point, key, id, rank }: Member) => ({
  point,
  key,
  ...(id !== undefined && { id }),
  ...(rank !== undefined && { rank }),
})

/** One member before anything of the plugin is loaded: how to put it, the code still to load, or why it cannot be put. */
const SKIN_ONLY =
  'a skin puts only on a point that holds one item for a key, where the most specific counts'

function stepOf({ shell, points, scope, code, files, skin, ports }: Asked, member: Member): Step {
  if ('directory' in member) return refused('this side takes no directory')
  const rules = points.get(member.point)
  if (
    skin &&
    rules !== undefined &&
    !(rules.arity === 'keyed-one' && rules.resolve === 'most-specific')
  )
    return refused(SKIN_ONLY)
  const form = rules === undefined ? undefined : shell.guestForm(member.point)
  const target =
    rules === undefined
      ? ({ kind: 'absent' } as const)
      : ({ kind: 'point', rules, form: form !== undefined } as const)
  const judged = judgeMember(target, member)
  if (judged.kind === 'not') {
    const { reason } = judged
    const absent = reason.kind === 'absent' ? { absent: reason.absent } : {}
    return { kind: 'fault', fault: { reason: reasonText(reason), ...absent } }
  }
  if (rules?.arity.startsWith('keyed-one') === true || rules?.arity === 'one')
    if (member.id !== undefined || member.rank !== undefined) return refused(ONE_ITEM)
  if (rules === undefined || judged.kind === 'held') return refused('this side holds no category')
  if (judged.kind === 'code')
    return code === undefined || !('module' in member)
      ? refused('this application loads no code')
      : {
          kind: 'code',
          pending: { member, code, rules, ports, ...(form !== undefined && { form }) },
        }
  const data = 'data' in member ? member.data : undefined
  try {
    const item =
      form === undefined
        ? data
        : form.form(data, { key: member.key, ...(files !== undefined && { files }) })
    if (typeof item !== 'object' || item === null)
      return refused('the data is not an item of the point')
    return { kind: 'put', put: shell => void shell.putItem(spotOf(member), item, scope) }
  } catch (error) {
    return refused(reasonOf(error))
  }
}

const filesAt = (place: string): object =>
  Object.freeze({
    url: (path: string): string | undefined =>
      insidePackage(path) ? `${place}${path}` : undefined,
  })

/** Loads the file of a member of code and takes its export: how to put its drawing, or why it cannot be. */
async function drawingOf(listed: Listed, pending: Pending, scope: Scope): Promise<Put | string> {
  const { code, member, rules, form, ports } = pending
  const { module: path, export: name } = member
  const loaded = await code
    .load(listed.name, listed.version, path)
    .then(file => ({ file }))
    .catch((error: unknown) => `${path} could not be loaded: ${reasonOf(error)}`)
  if (typeof loaded === 'string') return loaded
  const made = (loaded.file as Readonly<Record<string, unknown>> | null)?.[name]
  if (typeof made !== 'function') return `${path} exports no function named ${name}`
  return shell => {
    const files = code.files?.(listed.name, listed.version)
    const given = called(name, () => made(handedTo(code, shell, files, ports)))
    const source =
      files === undefined ? undefined : { module: `${files}${path}`, export: name, files }
    const item =
      form === undefined
        ? genericItem(rules, given)
        : { item: form.form(given, { key: member.key }) }
    if ('kind' in item) throw new Error(reasonText(item))
    shell.putItem(
      spotOf(member),
      { ...item.item, ...(source !== undefined && { source }) },
      scope,
      true,
    )
  }
}

/** What the code of a plugin is called with: what the application gives, the shell a guest may use, and its files. */
function handedTo(
  code: Code,
  shell: InstallShell,
  files: string | undefined,
  ports: object,
): object {
  return Object.freeze({
    ...code.given,
    shell: guestOf(shell),
    ports,
    ...(files !== undefined && { files: filesAt(files) }),
  })
}

const PROTOCOL = /^([^/]+)\/v([1-9][0-9]*)$/u

function portsOf(shell: InstallShell, needs: readonly string[]): object | string {
  const ports: Record<string, unknown> = {}
  for (const need of needs) {
    const key = PROTOCOL.exec(need)
    if (key === null) return `needs ${need}: this side lends only protocols, each <name>/v<major>`
    const protocol = needProtocol({ name: key[1]!, major: Number(key[2]) })
    ports[need] = protocolClientOf(() => shell.registry(), protocol)
  }
  return Object.freeze(ports)
}

export function handedNames(code: Code | undefined, shell: InstallShell): readonly string[] {
  if (code === undefined) return []
  const handed = handedTo(code, shell, code.files === undefined ? undefined : '/', {})
  return Object.entries(handed).flatMap(([name, value]) => [
    name,
    ...(typeof value === 'object' && value !== null
      ? Object.keys(value)
          .sort()
          .map(inner => `${name}.${inner}`)
      : []),
  ])
}

function called(name: string, call: () => unknown): unknown {
  try {
    return call()
  } catch (error) {
    throw new Error(`${name} threw: ${reasonOf(error)}`)
  }
}

const failed = (reason: string): Outcome => ({ kind: 'failed', reason })

type Labelled = Readonly<{ label: string; fault: Fault }>

function outcomeOf(faults: readonly Labelled[]): Outcome {
  const lasting = faults.find(({ fault }) => fault.absent === undefined)
  if (lasting !== undefined) return failed(`${lasting.label}: ${lasting.fault.reason}`)
  const lacks: Absent[] = []
  for (const { fault } of faults) {
    const { absent } = fault
    if (absent === undefined) continue
    if (!lacks.some(lack => lack.kind === absent.kind && lack.name === absent.name))
      lacks.push(absent)
  }
  return { kind: 'waiting', lacks }
}

type Ready = Readonly<{ label: string; step: Exclude<Step, { kind: 'fault' }> }>

function stepsOf(
  shell: InstallShell,
  { name, version, members, kind }: Listed,
  scope: Scope,
  ports: object,
  code?: Code,
): readonly Ready[] | Outcome {
  const points = new Map(
    shell.described().points.map(point => [point.name, point.contract] as const),
  )
  const files = code?.files?.(name, version)
  const asked: Asked = { shell, points, scope, code, files, ports, skin: kind === 'skin' }
  const places = members.map(member => `${member.point}\n${member.key}`)
  const ready: Ready[] = []
  const faults: Labelled[] = []
  for (const [index, member] of members.entries()) {
    const label = `member ${index + 1} (${member.point} ${member.key})`
    const twice = places.indexOf(places[index] ?? '') !== index
    const step = twice
      ? refused('another member of this plugin is at the same place')
      : stepOf(asked, member)
    if (step.kind === 'fault') faults.push({ label, fault: step.fault })
    else ready.push({ label, step })
  }
  return faults.length === 0 ? ready : outcomeOf(faults)
}

type Loaded = Readonly<{ label: string; put: Put }>

async function loadedOf(
  listed: Listed,
  steps: readonly Ready[],
  scope: Scope,
): Promise<readonly Loaded[] | string> {
  const loaded = await Promise.all(
    steps.map(async ({ label, step }) => ({
      label,
      put: step.kind === 'put' ? step.put : await drawingOf(listed, step.pending, scope),
    })),
  )
  const ready: Loaded[] = []
  for (const { label, put: one } of loaded) {
    if (typeof one === 'string') return `${label}: ${one}`
    ready.push({ label, put: one })
  }
  return ready
}

function putAll(inside: InstallShell, ready: readonly Loaded[]): void {
  for (const { label, put: one } of ready) {
    try {
      one(inside)
    } catch (error) {
      throw new Error(`${label}: ${reasonOf(error)}`)
    }
  }
}

function refusedOf(changes: Changes, by: string): Outcome | undefined {
  const mine = changes.refused.filter(each => each.by === by)
  if (mine.length === 0) return undefined
  return outcomeOf(
    mine.map(({ point, key, reason, absent }) => ({
      label: `${point} ${key}`,
      fault:
        absent === undefined ? { reason } : { reason, absent: { kind: 'reference', name: absent } },
    })),
  )
}

const lockedOf = (hosted: Hosted): Outcome | undefined => {
  const locked = hosted.effects().filter(effect => effect.state === 'locked')
  if (locked.length === 0) return undefined
  return outcomeOf(
    locked.map(({ entry, detail }) => ({
      label: `${entry.point} ${entry.key}${entry.id === '' ? '' : ` ${entry.id}`}`,
      fault: { reason: `locked by ${detail}: the app keeps its own item here` },
    })),
  )
}

/** Puts the members of one plugin in a scope of its own, in the scope it is to count in: all of them, or none. */
export async function installOn(
  shell: InstallShell,
  listed: Listed,
  scope: Scope,
  code?: Code,
): Promise<Outcome> {
  if (listed.fault !== undefined) return failed(listed.fault)
  const ports = portsOf(shell, listed.needs ?? [])
  if (typeof ports === 'string') return failed(ports)
  const steps = stepsOf(shell, listed, scope, ports, code)
  if (!Array.isArray(steps)) return steps as Outcome
  const ready = await loadedOf(listed, steps, scope)
  if (typeof ready === 'string') return failed(ready)
  const hosted = await shell
    .host(fiberOf(listed.name, listed.version), inside => putAll(inside, ready))
    .catch((error: unknown) => reasonOf(error))
  if (typeof hosted === 'string') return failed(hosted)
  const refusal = refusedOf(shell.changesFor(scope), hosted.by) ?? lockedOf(hosted)
  if (refusal === undefined) return { kind: 'installed', remove: () => hosted.dispose() }
  await hosted.dispose()
  return refusal
}

export function presentIn(described: Described, lacks: readonly Absent[]): boolean {
  return lacks.every(({ kind, name }) =>
    kind === 'reference'
      ? described.parts.some(part => part.name === name)
      : described.points.some(point => point.name === name),
  )
}
