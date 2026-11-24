import {
  capabilityId,
  digestBytes,
  type CapabilityId,
  type CategoryView,
  type HeldFiles,
  type HoldingOutcome,
  type JsonValue,
  type PackageReader,
  type ManagedAsset,
  type RecalledOperation,
  type PublishContent,
  type TenantPublishOutcome,
} from '@omne-harness/assets'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ExtensionsCallSource, ExtensionsFaces, Placed } from './port.ts'
import { limits, type ArgumentsOf, type ExtensionsCommandName } from './protocol.ts'
import {
  columns,
  conflict,
  denied,
  done,
  invalid,
  unavailable,
  unknown,
  type Answer,
} from './results.ts'
import {
  HOW,
  assetHead,
  fileCount,
  impactBody,
  namedPaths,
  noCategory,
  notHeld,
  placedLines,
  publishedLine,
  reused,
  sourceLines,
} from './text.ts'

type Asset = Extract<ManagedAsset, Readonly<{ kind: 'asset' }>>

/** What one call has: the source the binding gave, and the faces of the assets read at this call. */
export type Ready = Readonly<{
  source: ExtensionsCallSource
  faces: ExtensionsFaces
  scope: Readonly<{ tenant: string; principal: unknown }>
}>

export type Handler<K extends ExtensionsCommandName> = (
  ready: Ready,
  params: ArgumentsOf<K>['params'],
) => Promise<Answer>

export function revisionOf(source: ExtensionsCallSource): string | null {
  try {
    return source.revision()
  } catch {
    return null
  }
}

const settle = async <T>(ask: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await ask()
  } catch {
    return undefined
  }
}

function capabilityOf(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new TypeError('the parameters give a category and a name')
  return made.id
}

const categories: Handler<'categories'> = async ({ source, faces }) => {
  const listed = faces.categories.list()
  const rows = listed.map(({ category, creation, display }) => [
    category,
    HOW[creation],
    `${display.title} — ${display.summary}`,
  ])
  const count = `${listed.length} ${listed.length === 1 ? 'category' : 'categories'} now.`
  return done('categories', [...columns(rows), count], revisionOf(source))
}

const LIST_LIMIT = 50

const list: Handler<'list'> = async ({ source, faces, scope }, { category, after, limit }) => {
  const read = await settle(() =>
    faces.management.list({ ...scope, category, after: after ?? null, limit: limit ?? LIST_LIMIT }),
  )
  if (read === undefined) return unavailable('list')
  switch (read.kind) {
    case 'denied':
      return denied()
    case 'unavailable':
      return unavailable('list')
    case 'unknown-category':
      return invalid(noCategory(faces.categories, category))
    case 'invalid':
      return invalid('after is not a name from the list before; give the next one it named.')
  }
  const rows = columns(
    read.items.map(row => [row.capability.name, row.version, row.enabled ? 'enabled' : 'disabled']),
  )
  const count =
    read.next === null
      ? `${read.items.length} held.`
      : `${read.items.length} shown; more after them: give after=${JSON.stringify(read.next)}.`
  const partial = read.completeness === 'partial' ? [' Some of it could not be read.'] : []
  return done('list', [...rows, `${count}${partial.join('')}`], revisionOf(source))
}

async function heldAsset(
  { faces, scope }: Ready,
  command: ExtensionsCommandName,
  capability: CapabilityId,
): Promise<Asset | Readonly<{ kind: 'absent' }> | Answer> {
  const read = await settle(() => faces.management.describe({ ...scope, capability }))
  if (read === undefined || read.kind === 'unavailable') return unavailable(command)
  if (read.kind === 'denied') return denied()
  return read.kind === 'asset' ? read : { kind: 'absent' }
}

const show: Handler<'show'> = async (ready, { category, name }) => {
  const { source, faces, scope } = ready
  const listing = faces.categories.describe(category)
  if (listing === undefined) return invalid(noCategory(faces.categories, category))
  const capability = capabilityOf(category, name)
  const asset = await heldAsset(ready, 'show', capability)
  if (!('kind' in asset)) return asset
  if (asset.kind === 'absent') return invalid(notHeld(category, name))
  const placed = (await settle(() =>
    source.placement.of({ tenant: scope.tenant, capability }),
  )) ?? { kind: 'unavailable' as const, reason: 'the placement did not answer' }
  const closed = 'creation' in listing && listing.creation === 'none'
  return done(
    'show',
    [...assetHead(asset), ...placedLines(placed), ...sourceLines(asset, closed)],
    revisionOf(source),
  )
}

const BODY_FILE = 'body.json'

function bodyPackage(body: JsonValue): PackageReader {
  const bytes = new TextEncoder().encode(`${writeJsonText(body)}\n`)
  const digest = digestBytes(bytes)
  return {
    manifest: async () =>
      succeed({ entries: [{ path: BODY_FILE, bytes: bytes.byteLength, digest }] }),
    open: async (path, expected) =>
      path === BODY_FILE && expected === digest ? succeed(bytes) : fail('entry-not-found'),
  }
}

type Held = Extract<HeldFiles, Readonly<{ kind: 'files' | 'body' }>>

async function heldFiles(
  { faces, scope }: Ready,
  capability: CapabilityId,
): Promise<Held | Answer> {
  const read = await settle(() => faces.management.files({ ...scope, capability }))
  if (read === undefined) return unavailable('export')
  switch (read.kind) {
    case 'files':
    case 'body':
      return read
    case 'denied':
      return denied()
    case 'absent':
      return invalid(notHeld(capability.category, capability.name))
    default:
      return unavailable('export')
  }
}

const NOTHING_WRITTEN = 'nothing was written'

function placedAnswer(
  params: ArgumentsOf<'export'>['params'],
  version: string,
  placed: Placed,
  paths: readonly string[],
  body: boolean,
  revision: string | null,
): Answer {
  const { category, name, dir } = params
  const head = `export ${category} ${name}`
  switch (placed.kind) {
    case 'same':
      return done(
        head,
        [`${dir} already holds exactly version ${version}; ${NOTHING_WRITTEN}.`],
        revision,
      )
    case 'differs': {
      const more = placed.more > 0 ? ` and ${placed.more} more` : ''
      return conflict(
        `${dir} is not empty and differs from the held version in: ${placed.paths.join(', ')}${more}. Nothing was written. Give a directory that does not exist yet; or, if that directory is the newer work, ask impact with it and publish it.`,
      )
    }
    case 'absent':
      return invalid(`dir "${dir}" is not a place for a directory; ${NOTHING_WRITTEN}.`)
    case 'outside':
      return invalid(`${outside(dir, 'writing')}; ${NOTHING_WRITTEN}.`)
    case 'unavailable':
      return unavailable('export', `the workspace cannot be written now; ${NOTHING_WRITTEN}`)
    case 'written':
      return done(
        head,
        [
          `${version}   wrote ${fileCount(placed.files)} (${placed.bytes} bytes) to ${dir}`,
          `files: ${namedPaths(paths)}`,
          body
            ? 'Edit body.json there, then publish its content as data.'
            : `Edit them there, then: impact with dir ${dir}, then publish from it.`,
        ],
        revision,
      )
  }
}

const exportHeld: Handler<'export'> = async (ready, params) => {
  const { source, faces } = ready
  const { category, name, dir } = params
  if (faces.categories.describe(category) === undefined)
    return invalid(noCategory(faces.categories, category))
  const held = await heldFiles(ready, capabilityOf(category, name))
  if (!('kind' in held)) return held
  const from = held.kind === 'files' ? held.from : bodyPackage(held.body)
  const manifest = await settle(() => from.manifest())
  if (manifest === undefined || 'failure' in manifest)
    return unavailable('export', `the held files cannot be read now; ${NOTHING_WRITTEN}`)
  const paths = manifest.ok.entries.map(entry => entry.path)
  const placed = (await settle(() => source.place(dir, from))) ?? { kind: 'unavailable' }
  return placedAnswer(params, held.version, placed, paths, held.kind === 'body', revisionOf(source))
}

const lastSegment = (path: string) =>
  path
    .split('/')
    .filter(part => part !== '')
    .at(-1) ?? path

const outside = (dir: string, doing: 'reading' | 'writing'): string =>
  `dir "${dir}" is outside the workspace of this session, and the setting for files outside the workspace keeps this call from ${doing} there. Tell the user: the setting is theirs to change`

async function directoryContent(
  source: ExtensionsCallSource,
  command: ExtensionsCommandName,
  dir: string,
): Promise<PublishContent | Answer> {
  const found = await settle(() => source.directory(dir))
  if (found === undefined || found === 'unavailable')
    return unavailable(command, 'the workspace cannot be read now; nothing was changed')
  if (found === 'absent') return invalid(`dir "${dir}" is not a directory; nothing was changed.`)
  if (found === 'outside') return invalid(`${outside(dir, 'reading')}; nothing was changed.`)
  return { kind: 'directory', from: found }
}

const impact: Handler<'impact'> = async (ready, params) => {
  const { source, faces, scope } = ready
  const change = params.change ?? 'publish'
  if (params.dir === undefined && params.name === undefined)
    return invalid('give dir for a directory not yet published, or name for a held one.')
  if (params.dir !== undefined && change !== 'publish')
    return invalid(`dir goes with publish; to ask about ${change}, give the name of a held one.`)
  if (params.dir === undefined && change === 'publish')
    return invalid('give dir: the directory that would be published.')
  const listing = faces.categories.describe(params.category)
  if (listing === undefined) return invalid(noCategory(faces.categories, params.category))
  const name = params.name ?? lastSegment(params.dir as string)
  const capability = capabilityOf(params.category, name)
  const asset = await heldAsset(ready, 'impact', capability)
  if (!('kind' in asset)) return asset
  if (change !== 'publish' && asset.kind === 'absent')
    return invalid(notHeld(params.category, name))
  let content: PublishContent | undefined
  if (params.dir !== undefined) {
    const read = await directoryContent(source, 'impact', params.dir)
    if (!('kind' in read)) return read
    content = read
  }
  const asked = await settle(() =>
    source.impact.of({
      tenant: scope.tenant,
      capability,
      change,
      ...(content === undefined ? {} : { content }),
    }),
  )
  if (asked === undefined) return unavailable('impact', 'the impact cannot be read now')
  if (asked.kind === 'unavailable') {
    const layout = content === undefined ? '' : layoutPointer(listing, params.category)
    return unavailable('impact', `the impact cannot be read now: ${asked.reason}${layout}`)
  }
  const status = asset.kind === 'asset' ? 'published' : 'not published'
  return done(
    'impact',
    [
      `${params.category} ${name} (${status}), ${change}:`,
      ...impactBody(asked.lines, asked.loads, asked.advice),
    ],
    revisionOf(source),
  )
}

/** The operation under an id as the assets recall it, or the failure that stops the call. */
async function earlier(
  { faces, scope }: Ready,
  command: ExtensionsCommandName,
  id: string,
): Promise<RecalledOperation | Readonly<{ kind: 'absent' }> | Answer> {
  const read = await settle(() => faces.management.recallById({ ...scope, operationId: id }))
  if (read === undefined || read.kind === 'unavailable') return unavailable(command)
  if (read.kind === 'denied') return denied()
  return read.kind === 'publish' || read.kind === 'setEnabled' || read.kind === 'remove'
    ? read
    : { kind: 'absent' }
}

const receipt = (value: Readonly<Record<string, unknown>>) => JSON.stringify(value)

/** Where the layout of a category is said, when its owner says it; said after a problem with what was written. */
function layoutPointer(listing: ReturnType<CategoryView['describe']>, category: string): string {
  const said = listing !== undefined && 'display' in listing && listing.display.authoring
  return said
    ? `. For how a ${category} is written: help with name publish and category ${category}.`
    : ''
}

function refusedPublish(
  faces: ExtensionsFaces,
  params: ArgumentsOf<'publish'>['params'],
  outcome: Exclude<TenantPublishOutcome, Readonly<{ kind: 'published' }>>,
): Answer {
  const { id, category, name } = params
  switch (outcome.kind) {
    case 'denied':
      return denied()
    case 'unavailable':
      return unavailable('publish')
    case 'unknown':
      return unknown('publish')
    case 'unknown-category':
      return invalid(noCategory(faces.categories, category))
    case 'conflict':
      return conflict(
        `${category} ${name} was just held by another operation; send again with a new id.`,
      )
    case 'operation-conflict':
      return conflict(reused(id))
    case 'invalid':
      return invalid(publishRefusal(faces.categories, category, outcome.reason))
  }
}

/** The general entry's own refusals say how this category is made; the category's refusals pass as it wrote them. */
function publishRefusal(categories: CategoryView, category: string, reason: string): string {
  switch (reason) {
    case 'creation-closed':
      return `category ${category} is not made through here; nothing was changed. categories says how each is made.`
    case 'not-a-directory-category':
      return `category ${category} is made from a body: give data, not dir.`
    case 'a-directory-category':
      return `category ${category} is made from a directory: write it in the workspace and give dir.`
    default:
      return `${reason}${layoutPointer(categories.describe(category), category)}`
  }
}

const publish: Handler<'publish'> = async (ready, params) => {
  const { source, faces, scope } = ready
  const { id, category, name, dir, data } = params
  if ((dir === undefined) === (data === undefined))
    return invalid('give dir or data, one of them: what is published.')
  if (faces.categories.describe(category) === undefined)
    return invalid(noCategory(faces.categories, category))
  const before = await earlier(ready, 'publish', id)
  if (!('kind' in before)) return before
  let content: PublishContent
  if (dir !== undefined) {
    const read = await directoryContent(source, 'publish', dir)
    if (!('kind' in read)) return read
    content = read
  } else {
    const body = readJsonText(JSON.stringify(data), limits)
    if (body.kind !== 'ok') return invalid('data is not a JSON value within the limits.')
    content = { kind: 'data', body: body.value }
  }
  const capability = capabilityOf(category, name)
  const operationId = id
  const outcome = (await settle(() =>
    faces.publishing.publish({ ...scope, operationId, capability, content }),
  )) ?? { kind: 'unknown', operationId }
  if (outcome.kind !== 'published') return refusedPublish(faces, params, outcome)
  const recalled = before.kind === 'publish'
  const held = await settle(() => faces.management.describe({ ...scope, capability }))
  const enabled = held?.kind === 'asset' ? held.row.enabled : undefined
  const placed = recalled
    ? undefined
    : await settle(() => source.placement.of({ tenant: scope.tenant, capability }))
  const { version } = outcome
  const changed = recalled ? false : outcome.changed
  return done(
    'publish',
    [
      receipt({ id, category, name, version, changed, enabled, recalled }),
      ...(recalled ? [] : publishedLine(enabled, placed)),
    ],
    revisionOf(source),
  )
}

type Changing = 'enable' | 'disable' | 'remove'

function refusedChange(
  command: Changing,
  params: ArgumentsOf<Changing>['params'],
  outcome: HoldingOutcome,
): Answer | undefined {
  const { id, category, name } = params
  switch (outcome.kind) {
    case 'changed':
    case 'no-change':
      return undefined
    case 'denied':
      return denied()
    case 'unavailable':
      return unavailable(command)
    case 'unknown':
      return unknown(command)
    case 'absent':
      return invalid(notHeld(category, name))
    case 'conflict':
      return conflict(
        `${category} ${name} changed while this ran; read show and send again with a new id.`,
      )
    case 'operation-conflict':
      return conflict(reused(id))
    case 'not-writable':
      return invalid(
        outcome.reason === 'official'
          ? `${category} ${name} came with the deployment; it cannot be disabled or removed.`
          : `${category} ${name} was removed; publish it to hold it again.`,
      )
  }
}

const AFTER: Readonly<Record<Changing, string>> = {
  enable: 'in effect from now.',
  disable: 'no longer in effect. What it had replaced is back.',
  remove: 'removed; no longer in effect.',
}

/** Whether an earlier operation under the id is this same command on this same extension. */
function sameChange(
  command: Changing,
  params: ArgumentsOf<Changing>['params'],
  before: RecalledOperation,
) {
  const kindFits =
    command === 'remove'
      ? before.kind === 'remove'
      : before.kind === 'setEnabled' && before.enabled === (command === 'enable')
  if (!kindFits) return false
  const capability = (before as Readonly<{ capability: CapabilityId | null }>).capability
  return (
    capability === null ||
    (capability.category === params.category && capability.name === params.name)
  )
}

function changeOf(command: Changing): Handler<Changing> {
  return async (ready, params) => {
    const { source, faces, scope } = ready
    const { id, category, name } = params
    if (faces.categories.describe(category) === undefined)
      return invalid(noCategory(faces.categories, category))
    const before = await earlier(ready, command, id)
    if (!('kind' in before)) return before
    let outcome: HoldingOutcome
    const recalled = before.kind !== 'absent'
    if (recalled) {
      if (!sameChange(command, params, before) || before.kind === 'publish')
        return conflict(reused(id))
      outcome = before.outcome
    } else {
      const asset = await heldAsset(ready, command, capabilityOf(category, name))
      if (!('kind' in asset)) return asset
      if (asset.kind === 'absent') return invalid(notHeld(category, name))
      const holding = asset.row.holding
      const operationId = id
      const write = () =>
        command === 'remove'
          ? faces.management.remove({ ...scope, operationId, holding })
          : faces.management.setEnabled({
              ...scope,
              operationId,
              holding,
              enabled: command === 'enable',
            })
      outcome = (await settle(write)) ?? { kind: 'unknown', operationId }
    }
    const refused = refusedChange(command, params, outcome)
    if (refused !== undefined) return refused
    const changed = !recalled && outcome.kind === 'changed'
    const enabled = command === 'remove' ? {} : { enabled: command === 'enable' }
    return done(
      command,
      [
        receipt({ id, category, name, ...enabled, changed, recalled }),
        ...(changed ? [AFTER[command]] : []),
      ],
      revisionOf(source),
    )
  }
}

/** What the operation under an id did: its receipt, recalled; one still not known is still a failure. */
const result: Handler<'result'> = async (ready, { id }) => {
  const before = await earlier(ready, 'result', id)
  if (!('kind' in before)) return before
  if (before.kind === 'absent')
    return done(
      'result',
      [`nothing was done under the id "${id}" for this tenant.`],
      revisionOf(ready.source),
    )
  const capability =
    before.capability === null
      ? {}
      : { category: before.capability.category, name: before.capability.name }
  const command =
    before.kind === 'publish'
      ? 'publish'
      : before.kind === 'remove'
        ? 'remove'
        : before.enabled
          ? 'enable'
          : 'disable'
  const outcome = before.outcome
  if (outcome.kind === 'unknown') return unknown('result')
  let body: Record<string, unknown>
  if (outcome.kind === 'published') body = { version: outcome.version, changed: outcome.changed }
  else if (outcome.kind === 'changed' || outcome.kind === 'no-change')
    body = {
      ...(before.kind === 'setEnabled' ? { enabled: before.enabled } : {}),
      changed: outcome.kind === 'changed',
    }
  else body = { refused: outcome.kind, ...('reason' in outcome ? { reason: outcome.reason } : {}) }
  return done(
    'result',
    [receipt({ id, command, ...capability, ...body, recalled: true })],
    revisionOf(ready.source),
  )
}

export type Reaching = Exclude<ExtensionsCommandName, 'help'>
export const HANDLERS: { readonly [K in Reaching]: Handler<K> } = {
  categories,
  list,
  show,
  export: exportHeld,
  impact,
  publish,
  enable: changeOf('enable') as Handler<'enable'>,
  disable: changeOf('disable') as Handler<'disable'>,
  remove: changeOf('remove') as Handler<'remove'>,
  result,
}
