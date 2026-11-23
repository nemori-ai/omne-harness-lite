import type { JsonValue, Member } from '@omne-harness/plugin-protocol'
import {
  LAYOUT_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  type PartStyle,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import type { Listed, Outcome } from './loader.ts'

type Scope = Parameters<ShellService['putStyle']>[2]
type Put = (shell: ShellService) => void
type Record_ = Readonly<Record<string, JsonValue>>

const isRecord = (data: JsonValue): data is Record_ =>
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

function putOf(member: Member, scope: Scope): Put | string {
  if ('directory' in member) return 'this side takes no directory'
  if ('module' in member) return 'this side loads no code'
  const taken = DATA[member.point]
  if (taken === undefined) return 'the point takes no data from a plugin'
  if (member.id !== undefined || member.rank !== undefined)
    return 'the point holds one item for a key, so a member writes no id and no rank'
  return taken(member.key, member.data, scope)
}

const failed = (reason: string): Outcome => ({ kind: 'failed', reason })
const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Puts the members of one plugin in a scope of its own, in the scope it is to count in: all of them, or none. */
export async function installOn(
  shell: ShellService,
  listed: Listed,
  scope: Scope,
): Promise<Outcome> {
  if (listed.fault !== undefined) return failed(listed.fault)
  const puts: Put[] = []
  const places = listed.members.map(member => `${member.point}\n${member.key}`)
  for (const [index, member] of listed.members.entries()) {
    const twice = places.indexOf(places[index] ?? '') !== index
    const put = twice ? 'another member of this plugin is at the same place' : putOf(member, scope)
    if (typeof put === 'string')
      return failed(`member ${index + 1} (${member.point} ${member.key}): ${put}`)
    puts.push(put)
  }
  const name = `plugin:${listed.name}@${listed.version}`
  const hosted = await shell
    .host(name, inside => {
      for (const put of puts) put(inside)
    })
    .catch((error: unknown) => reasonOf(error))
  if (typeof hosted === 'string') return failed(hosted)
  const [refused] = shell.changes().refused.filter(each => each.by === hosted.by)
  if (refused === undefined) return { kind: 'installed', remove: () => hosted.dispose() }
  await hosted.dispose()
  return failed(`${refused.point} ${refused.key}: ${refused.reason}`)
}
