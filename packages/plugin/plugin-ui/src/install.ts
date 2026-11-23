import type { JsonValue, Member, ModuleMember } from '@omne-harness/plugin-protocol'
import {
  LAYOUT_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  type KeyRender,
  type PartStyle,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import type { Listed, Outcome } from './loader.ts'

/** How the application loads the code of a plugin, and what it hands that code beside the shell. */
export type Code = Readonly<{
  load: (name: string, version: string, path: string) => Promise<unknown>
  given: Readonly<Record<string, unknown>>
}>

type Scope = Parameters<ShellService['putStyle']>[2]
type Put = (shell: ShellService) => void
type Entries = Readonly<Record<string, JsonValue>>

const ONE_ITEM = 'the point holds one item for a key, so a member writes no id and no rank'

const isRecord = (data: JsonValue): data is Entries =>
  typeof data === 'object' && data !== null && !Array.isArray(data)

/** The points that take data from a plugin: what the data must be, and how it is put. */
const DATA: Readonly<Record<string, (key: string, data: JsonValue, scope: Scope) => Put | string>> =
  {
    [TOKENS_POINT]: (key, data, scope) =>
      isRecord(data)
        ? shell => shell.putTokens(key, data as Readonly<Record<string, string>>, scope)
        : 'the data is not a record of names and values',
    [STYLE_POINT]: (key, data, scope) =>
      isRecord(data)
        ? shell => shell.putStyle(key, data as PartStyle, scope)
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
  return single ? taken(member.key, member.data, scope) : ONE_ITEM
}

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
    const drawing = called(name, () =>
      made(Object.freeze({ ...code.given, shell: guestOf(shell) })),
    )
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

/** Puts the members of one plugin in a scope of its own, in the scope it is to count in: all of them, or none. */
export async function installOn(
  shell: ShellService,
  listed: Listed,
  scope: Scope,
  code?: Code,
): Promise<Outcome> {
  if (listed.fault !== undefined) return failed(listed.fault)
  const { members } = listed
  const places = members.map(member => `${member.point}\n${member.key}`)
  const steps: Readonly<{ label: string; step: Put | Pending }>[] = []
  for (const [index, member] of members.entries()) {
    const label = `member ${index + 1} (${member.point} ${member.key})`
    const twice = places.indexOf(places[index] ?? '') !== index
    const step = twice
      ? 'another member of this plugin is at the same place'
      : stepOf(shell, member, scope, code)
    if (typeof step === 'string') return failed(`${label}: ${step}`)
    steps.push({ label, step })
  }
  const ready = await Promise.all(
    steps.map(async ({ label, step }) => ({
      label,
      put: typeof step === 'function' ? step : await drawingOf(listed, step, scope),
    })),
  )
  const puts: Readonly<{ label: string; put: Put }>[] = []
  for (const { label, put } of ready) {
    if (typeof put === 'string') return failed(`${label}: ${put}`)
    puts.push({ label, put })
  }
  const hosted = await shell
    .host(`plugin:${listed.name}@${listed.version}`, inside => {
      for (const { label, put } of puts) {
        try {
          put(inside)
        } catch (error) {
          throw new Error(`${label}: ${reasonOf(error)}`)
        }
      }
    })
    .catch((error: unknown) => reasonOf(error))
  if (typeof hosted === 'string') return failed(hosted)
  const [refused] = shell.changes().refused.filter(each => each.by === hosted.by)
  if (refused === undefined) return { kind: 'installed', remove: () => hosted.dispose() }
  await hosted.dispose()
  return failed(`${refused.point} ${refused.key}: ${refused.reason}`)
}
