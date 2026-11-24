import {
  fiberOf,
  insidePackage,
  type JsonValue,
  type Listed,
  type Member,
  type ModuleMember,
  type Outcome,
} from '@omne-harness/plugin-protocol'
import {
  LAYOUT_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  type KeyRender,
  type PartStyle,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'

/** How the application loads the code of a plugin, and what it hands that code beside the shell. */
export type Code = Readonly<{
  load: (name: string, version: string, path: string) => Promise<unknown>
  given: Readonly<Record<string, unknown>>
  files?: (name: string, version: string) => string
}>

type Scope = Parameters<ShellService['putStyle']>[2]
type Put = (shell: ShellService) => void
type Entries = Readonly<Record<string, JsonValue>>

const ONE_ITEM = 'the point holds one item for a key, so a member writes no id and no rank'

const isRecord = (data: JsonValue): data is Entries =>
  typeof data === 'object' && data !== null && !Array.isArray(data)

/** The points that take data from a plugin: what the data must be, and how it is put. */
type Taken = (key: string, data: JsonValue, scope: Scope, files: string | undefined) => Put | string

const DATA: Readonly<Record<string, Taken>> = {
  [TOKENS_POINT]: (key, data, scope, files) =>
    isRecord(data)
      ? shell => shell.putTokens(key, data as Readonly<Record<string, string>>, scope, files)
      : 'the data is not a record of names and values',
  [STYLE_POINT]: (key, data, scope, files) =>
    isRecord(data)
      ? shell => shell.putStyle(key, data as PartStyle, scope, files)
      : 'the data is not a record of states and declarations',
  [LAYOUT_POINT]: (key, data, scope) =>
    Array.isArray(data)
      ? shell => shell.putLayout(key, data as readonly string[], scope)
      : 'the data is not a list of ids',
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** What the code of a plugin may do with the shell: nothing that puts. Putting stays with the loader. */
const guestOf = (shell: ShellService): object =>
  Object.freeze({
    navigate: (page: string, subject?: string) => shell.navigate(page, subject),
    toast: (toast: Parameters<ShellService['toast']>[0]) => shell.toast(toast),
    scope: Object.freeze({
      get: () => shell.scope.get(),
      subscribe: (listener: (scope: string | undefined) => void) => shell.scope.subscribe(listener),
    }),
  })

type Pending = Readonly<{ member: ModuleMember; code: Code }>

/** One member before anything of the plugin is loaded: how to put it, the code still to load, or why it cannot be put. */
function stepOf(
  shell: ShellService,
  member: Member,
  scope: Scope,
  code: Code | undefined,
  files: string | undefined,
): Put | Pending | string {
  if ('directory' in member) return 'this side takes no directory'
  const single = member.id === undefined && member.rank === undefined
  if ('module' in member) {
    if (!shell.takesDrawing(member.point)) return 'the point takes no drawing'
    if (!single) return ONE_ITEM
    return code === undefined ? 'this application loads no code' : { member, code }
  }
  const taken = DATA[member.point]
  if (taken === undefined) return 'the point takes no data from a plugin'
  return single ? taken(member.key, member.data, scope, files) : ONE_ITEM
}

const filesAt = (place: string): object =>
  Object.freeze({
    url: (path: string): string | undefined =>
      insidePackage(path) ? `${place}${path}` : undefined,
  })

/** Loads the file of a member of code and takes its export: how to put its drawing, or why it cannot be. */
async function drawingOf(listed: Listed, pending: Pending, scope: Scope): Promise<Put | string> {
  const { code, member } = pending
  const { module: path, export: name, point, key } = member
  const loaded = await code
    .load(listed.name, listed.version, path)
    .then(file => ({ file }))
    .catch((error: unknown) => `${path} could not be loaded: ${reasonOf(error)}`)
  if (typeof loaded === 'string') return loaded
  const made = (loaded.file as Readonly<Record<string, unknown>> | null)?.[name]
  if (typeof made !== 'function') return `${path} exports no function named ${name}`
  return shell => {
    const files = code.files?.(listed.name, listed.version)
    const handed = {
      ...code.given,
      shell: guestOf(shell),
      ...(files !== undefined && { files: filesAt(files) }),
    }
    const drawing = called(name, () => made(Object.freeze(handed)))
    if (typeof drawing !== 'function') throw new Error(`${name} gave no drawing`)
    shell.putDrawing(point, key, drawing as KeyRender, scope)
  }
}

function called(name: string, call: () => unknown): unknown {
  try {
    return call()
  } catch (error) {
    throw new Error(`${name} threw: ${reasonOf(error)}`)
  }
}

const failed = (reason: string): Outcome => ({ kind: 'failed', reason })

type Step = Readonly<{ label: string; step: Put | Pending }>
type Ready = Readonly<{ label: string; put: Put }>

function stepsOf(
  shell: ShellService,
  { name, version, members }: Listed,
  scope: Scope,
  code?: Code,
): readonly Step[] | string {
  const files = code?.files?.(name, version)
  const places = members.map(member => `${member.point}\n${member.key}`)
  const steps: Step[] = []
  for (const [index, member] of members.entries()) {
    const label = `member ${index + 1} (${member.point} ${member.key})`
    const twice = places.indexOf(places[index] ?? '') !== index
    const step = twice
      ? 'another member of this plugin is at the same place'
      : stepOf(shell, member, scope, code, files)
    if (typeof step === 'string') return `${label}: ${step}`
    steps.push({ label, step })
  }
  return steps
}

async function readyOf(
  listed: Listed,
  steps: readonly Step[],
  scope: Scope,
): Promise<readonly Ready[] | string> {
  const loaded = await Promise.all(
    steps.map(async ({ label, step }) => ({
      label,
      put: typeof step === 'function' ? step : await drawingOf(listed, step, scope),
    })),
  )
  const ready: Ready[] = []
  for (const { label, put } of loaded) {
    if (typeof put === 'string') return `${label}: ${put}`
    ready.push({ label, put })
  }
  return ready
}

function putAll(inside: ShellService, ready: readonly Ready[]): void {
  for (const { label, put } of ready) {
    try {
      put(inside)
    } catch (error) {
      throw new Error(`${label}: ${reasonOf(error)}`)
    }
  }
}

/** Puts the members of one plugin in a scope of its own, in the scope it is to count in: all of them, or none. */
export async function installOn(
  shell: ShellService,
  listed: Listed,
  scope: Scope,
  code?: Code,
): Promise<Outcome> {
  if (listed.fault !== undefined) return failed(listed.fault)
  const steps = stepsOf(shell, listed, scope, code)
  if (typeof steps === 'string') return failed(steps)
  const ready = await readyOf(listed, steps, scope)
  if (typeof ready === 'string') return failed(ready)
  const hosted = await shell
    .host(fiberOf(listed.name, listed.version), inside => putAll(inside, ready))
    .catch((error: unknown) => reasonOf(error))
  if (typeof hosted === 'string') return failed(hosted)
  const [refused] = shell.changesFor(scope ?? []).refused.filter(each => each.by === hosted.by)
  if (refused === undefined) return { kind: 'installed', remove: () => hosted.dispose() }
  await hosted.dispose()
  return failed(`${refused.point} ${refused.key}: ${refused.reason}`)
}
