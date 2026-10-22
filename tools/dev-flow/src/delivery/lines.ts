import { array, fields, literal, safePath, string, IntegrationError } from '../integration/parse.ts'
import type { Policy } from '../integration/policy.ts'

/** The line ownership table; the adopted rules live in docs/engineering/integration.md「交付线」. */
export const LINES_PATH = 'docs/engineering/delivery-lines.json'
/** The line value of a card that belongs to the integration track instead of a line. */
export const INTEGRATION_LINE = 'integration'
const LINE_ID = /^[a-z][a-z0-9-]*$/

export type DeliveryLine = {
  id: string
  title: string
  owner: string
  /** The line track ID, or null while the line's cards go to the integration track. */
  track: string | null
  paths: string[]
  contracts: string[]
}
export type DeliveryLines = {
  schemaVersion: 1
  integration: { track: string; paths: string[] }
  /** Paths any card may write with changes generated or registered by its other changes. */
  shared: string[]
  lines: DeliveryLine[]
}
export type LinesErrorCode =
  | 'line-duplicate'
  | 'line-reserved'
  | 'ownership-overlap'
  | 'member-uncovered'
  | 'contract-not-member'
  | 'contract-outside-line'
  | 'track-unregistered'
  | 'track-status'
  | 'track-parent'
/** One table error; `at` locates the entry as a JSON path into the table. */
export type LinesError = { code: LinesErrorCode; at: string; message: string }

export function lineId(value: unknown, path: string): string {
  const id = string(value, path)
  if (!LINE_ID.test(id))
    throw new IntegrationError('input-error', `${path} must be a lowercase line ID`)
  return id
}
function paths(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => safePath(item, `${path}[${index}]`))
}
function parseLine(value: unknown, index: number): DeliveryLine {
  const at = `lines[${index}]`
  const v = fields(value, ['id', 'title', 'owner', 'track', 'paths', 'contracts'], at)
  return {
    id: lineId(v.id, `${at}.id`),
    title: string(v.title, `${at}.title`),
    owner: string(v.owner, `${at}.owner`),
    track: v.track === null ? null : string(v.track, `${at}.track`),
    paths: paths(v.paths, `${at}.paths`),
    contracts: paths(v.contracts, `${at}.contracts`),
  }
}
/** Parses the table shape. Unknown fields are refused; semantic rules are left to validation. */
export function parseDeliveryLines(value: unknown): DeliveryLines {
  const v = fields(value, ['schemaVersion', 'integration', 'shared', 'lines'], 'delivery-lines')
  const integration = fields(v.integration, ['track', 'paths'], 'integration')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    integration: {
      track: string(integration.track, 'integration.track'),
      paths: paths(integration.paths, 'integration.paths'),
    },
    shared: paths(v.shared, 'shared'),
    lines: array(v.lines, 'lines').map(parseLine),
  }
}

/** True when `path` is `prefix` or lies below it as a directory. */
export function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}
type Entry = { owner: string; path: string; at: string }
function entries(table: DeliveryLines): Entry[] {
  return [
    ...table.integration.paths.map((path, index) => ({
      owner: INTEGRATION_LINE,
      path,
      at: `integration.paths[${index}]`,
    })),
    ...table.lines.flatMap((line, lineIndex) =>
      line.paths.map((path, index) => ({
        owner: line.id,
        path,
        at: `lines[${lineIndex}].paths[${index}]`,
      })),
    ),
  ]
}

function idErrors(table: DeliveryLines): LinesError[] {
  const errors: LinesError[] = [],
    seen = new Map<string, number>()
  table.lines.forEach((line, index) => {
    const at = `lines[${index}].id`
    if (line.id === INTEGRATION_LINE)
      errors.push({
        code: 'line-reserved',
        at,
        message: `线 ID ${line.id} 留给联调轨道，不能作为线 ID。`,
      })
    const first = seen.get(line.id)
    if (first !== undefined)
      errors.push({
        code: 'line-duplicate',
        at,
        message: `线 ID ${line.id} 已在 lines[${first}] 使用。`,
      })
    else seen.set(line.id, index)
  })
  return errors
}
/** Entries of different owners where one path contains the other; reported at the later entry. */
function overlapErrors(all: readonly Entry[]): LinesError[] {
  return all.flatMap((entry, index) =>
    all
      .slice(0, index)
      .filter(
        other =>
          other.owner !== entry.owner &&
          (under(entry.path, other.path) || under(other.path, entry.path)),
      )
      .map(other => ({
        code: 'ownership-overlap' as const,
        at: entry.at,
        message: `${entry.path}（${entry.owner}）与 ${other.at} 的 ${other.path}（${other.owner}）归属重叠。`,
      })),
  )
}
/** Members that no entry covers. A member covered twice is already an overlap. */
function memberErrors(
  all: readonly Entry[],
  members: readonly { readonly path: string }[],
): LinesError[] {
  return members
    .filter(member => !all.some(entry => under(member.path, entry.path)))
    .map(member => ({
      code: 'member-uncovered' as const,
      at: 'lines',
      message: `工作区成员 ${member.path} 不属于任何一条线，也不在 integration.paths 中。`,
    }))
}
function contractErrors(
  table: DeliveryLines,
  members: readonly { readonly path: string }[],
): LinesError[] {
  const memberPaths = new Set(members.map(member => member.path))
  return table.lines.flatMap((line, lineIndex) =>
    line.contracts.flatMap((contract, index): LinesError[] => {
      const at = `lines[${lineIndex}].contracts[${index}]`
      if (!memberPaths.has(contract))
        return [
          { code: 'contract-not-member', at, message: `契约成员 ${contract} 不是工作区成员。` },
        ]
      if (!line.paths.some(path => under(contract, path)))
        return [
          {
            code: 'contract-outside-line',
            at,
            message: `契约成员 ${contract} 不在线 ${line.id} 拥有的路径下。`,
          },
        ]
      return []
    }),
  )
}
function trackErrors(table: DeliveryLines, registry: Pick<Policy, 'tracks'>): LinesError[] {
  const errors: LinesError[] = []
  if (!registry.tracks.some(track => track.id === table.integration.track))
    errors.push({
      code: 'track-unregistered',
      at: 'integration.track',
      message: `联调轨道 ${table.integration.track} 未在 registry 登记。`,
    })
  table.lines.forEach((line, index) => {
    if (line.track === null) return
    const at = `lines[${index}].track`,
      track = registry.tracks.find(item => item.id === line.track)
    if (track === undefined)
      errors.push({
        code: 'track-unregistered',
        at,
        message: `线 ${line.id} 的轨道 ${line.track} 未在 registry 登记。`,
      })
    else if (track.status !== 'active' && track.status !== 'paused')
      errors.push({
        code: 'track-status',
        at,
        message: `线 ${line.id} 的轨道 ${line.track} 状态为 ${track.status}，须为 active 或 paused。`,
      })
    else if (track.parent !== table.integration.track)
      errors.push({
        code: 'track-parent',
        at,
        message: `线 ${line.id} 的轨道 ${line.track} 的上游是 ${track.parent}，须为联调轨道 ${table.integration.track}。`,
      })
  })
  return errors
}
/**
 * Checks the table against the workspace members and the policy registry.
 * Each defect yields one error at the entry that causes it.
 */
export function validateDeliveryLines(
  table: DeliveryLines,
  members: readonly { readonly path: string }[],
  registry: Pick<Policy, 'tracks'>,
): LinesError[] {
  const all = entries(table)
  return [
    ...idErrors(table),
    ...overlapErrors(all),
    ...memberErrors(all, members),
    ...contractErrors(table, members),
    ...trackErrors(table, registry),
  ]
}

/** The owner of a path: the line or integration entry above it; unlisted paths belong to integration. */
export function pathOwner(table: DeliveryLines, path: string): string {
  const owners = entries(table)
    .filter(entry => under(path, entry.path))
    .sort((a, b) => b.path.length - a.path.length)
  return owners[0]?.owner ?? INTEGRATION_LINE
}
/**
 * Every owner a write scope entry can touch. An entry inside an owned path has that owner.
 * A broader entry touches the owners of the paths below it and integration for the rest.
 */
export function scopeOwners(table: DeliveryLines, path: string): Set<string> {
  if (entries(table).some(entry => under(path, entry.path)))
    return new Set([pathOwner(table, path)])
  return new Set([
    INTEGRATION_LINE,
    ...entries(table)
      .filter(entry => under(entry.path, path))
      .map(entry => entry.owner),
  ])
}
export function isShared(table: DeliveryLines, path: string): boolean {
  return table.shared.some(shared => under(path, shared))
}
export function findLine(table: DeliveryLines, id: string): DeliveryLine | undefined {
  return table.lines.find(line => line.id === id)
}
/** The track a line's cards enter: its line track, or the integration track while it has none. */
export function targetTrack(table: DeliveryLines, id: string): string {
  return id === INTEGRATION_LINE
    ? table.integration.track
    : (findLine(table, id)?.track ?? table.integration.track)
}
