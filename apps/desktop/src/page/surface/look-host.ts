import type { Asked, DeskToast, LookDrawing, LookProjection, LookSource } from '../desk/scene.ts'

export type DrawingGiven = Readonly<{
  scope: string | undefined
  subject: object
  generic: () => unknown
}>
export type Drawing = (given: DrawingGiven) => unknown

/** What the surface does to wear a projection, in this order: the host only says when. */
export type Wear = Readonly<{ adopt(css: string): void; drop(): void; inked(): void }>

export type LookHostDeps = Readonly<{
  load: (module: string) => Promise<unknown>
  given: Readonly<Record<string, unknown>>
  later: (ms: number, run: () => void) => () => void
  wear: Wear
  up: (asked: Asked) => void
}>

/** `void`: a newer projection of another issuer came, so the scenes held for the old one are void. */
export type LookEvent = 'worn' | 'void'

export type LookHost = Readonly<{
  take(projection: LookProjection): void
  held(): LookProjection | undefined
  drawingAt(point: string, key: string): Drawing | undefined
  threw(point: string, key: string, error: unknown): void
  subscribe(listener: (event: LookEvent) => void): () => void
}>

const PLUGIN_FILES = '/bridge/plugins/'
const SETTLE_MS = 4000

type Outcome = Readonly<{ drawing: Drawing }> | Readonly<{ reason: string }>
type Worn = Readonly<{ projection: LookProjection; table: ReadonlyMap<string, Drawing> }>
type InHand = () => LookProjection | undefined

const SEGMENT = /^[A-Za-z0-9._-]+$/u
const insidePackage = (path: string): boolean =>
  path.split('/').every(each => SEGMENT.test(each) && each !== '.' && each !== '..')

/** Only a plain path under the plugin files is fetched: no step up, no query, nothing the page could resolve elsewhere. */
const under = (path: string): boolean =>
  path.startsWith(PLUGIN_FILES) && insidePackage(path.slice(PLUGIN_FILES.length))
const fetched = ({ module, files }: LookSource): boolean =>
  under(module) && (files === undefined || (files.endsWith('/') && under(files.slice(0, -1))))

const sourceKey = (source: LookSource): string =>
  JSON.stringify([source.module, source.export, source.files ?? null])
const placeKey = (point: string, key: string): string => JSON.stringify([point, key])
const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const newerThan = (next: LookProjection, held: LookProjection | undefined): boolean =>
  held === undefined || next.issuer !== held.issuer || next.version > held.version

const same = (next: LookProjection, pending: LookProjection | undefined): boolean =>
  pending?.issuer === next.issuer && pending.version === next.version

const wanted = (projection: LookProjection): readonly LookSource[] =>
  projection.scope === undefined ? [] : projection.drawings.map(drawing => drawing.source)

const undrawn = (projection: LookProjection, drawing: LookDrawing, reason: string): Asked => ({
  kind: 'undrawn',
  issuer: projection.issuer,
  ...(projection.scope === undefined ? {} : { scope: projection.scope }),
  point: drawing.point,
  key: drawing.key,
  module: drawing.source.module,
  export: drawing.source.export,
  reason,
})

function guestOf(deps: LookHostDeps, held: InHand, scopes: Set<(scope?: string) => void>) {
  const signedIn = () => {
    const projection = held()
    return projection?.scope === undefined
      ? undefined
      : { issuer: projection.issuer, scope: projection.scope }
  }
  return Object.freeze({
    navigate: (page: string, subject?: string) => {
      const asker = signedIn()
      if (asker !== undefined)
        deps.up({ kind: 'navigate', ...asker, page, ...(subject === undefined ? {} : { subject }) })
    },
    toast: (toast: DeskToast) => {
      const asker = signedIn()
      if (asker !== undefined) deps.up({ kind: 'toast', ...asker, toast })
    },
    scope: Object.freeze({
      get: () => held()?.scope,
      subscribe: (listener: (scope?: string) => void) => {
        scopes.add(listener)
        return () => void scopes.delete(listener)
      },
    }),
  })
}

/** Takes the drawing of one source: its file once per module, its export called with what a loader hands. */
function drawingsFrom(deps: LookHostDeps, guest: object) {
  const modules = new Map<string, Promise<unknown>>()
  const loaded = (module: string): Promise<unknown> => {
    const known = modules.get(module)
    if (known !== undefined) return known
    const loading = deps.load(module)
    modules.set(module, loading)
    loading.catch(() => modules.get(module) === loading && modules.delete(module))
    return loading
  }
  const handed = (files: string | undefined): object =>
    Object.freeze({
      ...deps.given,
      shell: guest,
      ...(files !== undefined && {
        files: Object.freeze({
          url: (path: string) => (insidePackage(path) ? `${files}${path}` : undefined),
        }),
      }),
    })
  return async ({ module, export: name, files }: LookSource): Promise<Outcome> => {
    let file: unknown
    try {
      file = await loaded(module)
    } catch (error) {
      return { reason: `${module} could not be loaded: ${reasonOf(error)}` }
    }
    const made = (file as Readonly<Record<string, unknown>> | null)?.[name]
    if (typeof made !== 'function') return { reason: `${module} exports no function named ${name}` }
    let drawing: unknown
    try {
      drawing = made(handed(files))
    } catch (error) {
      return { reason: `${name} threw: ${reasonOf(error)}` }
    }
    return typeof drawing === 'function'
      ? { drawing: drawing as Drawing }
      : { reason: `${name} gave no drawing` }
  }
}

/** Draws a surface by the projection of the changes: wears a whole one once each source it lists has an outcome. */
export function createLookHost(deps: LookHostDeps): LookHost {
  const got = new Map<string, Drawing>()
  const running = new Set<string>()
  const listeners = new Set<(event: LookEvent) => void>()
  const scopes = new Set<(scope?: string) => void>()
  const told = new Set<string>()
  let worn: Worn | undefined
  let pending: LookProjection | undefined
  const open = new Set<string>()
  let booted = false
  let voided = false
  const drawingOf = drawingsFrom(
    deps,
    guestOf(deps, () => (voided ? undefined : worn?.projection), scopes),
  )

  const wear = (projection: LookProjection) => {
    const was = worn?.projection.scope
    const table = new Map<string, Drawing>()
    if (projection.scope !== undefined)
      for (const { point, key, source } of projection.drawings) {
        const drawing = got.get(sourceKey(source))
        if (drawing !== undefined) table.set(placeKey(point, key), drawing)
      }
    deps.wear.adopt(projection.css)
    worn = { projection, table }
    voided = false
    if (!booted) deps.wear.drop()
    booted = true
    deps.wear.inked()
    for (const listener of listeners) listener('worn')
    if (was !== projection.scope) for (const listener of scopes) listener(projection.scope)
  }

  const settle = (key: string, outcome: Outcome, first: boolean) => {
    if ('drawing' in outcome && !got.has(key)) got.set(key, outcome.drawing)
    if (!first) return
    running.delete(key)
    if (!open.delete(key) || pending === undefined) return
    const projection = pending
    if ('reason' in outcome)
      for (const drawing of projection.drawings)
        if (sourceKey(drawing.source) === key) deps.up(undrawn(projection, drawing, outcome.reason))
    if (open.size > 0) return
    pending = undefined
    wear(projection)
  }

  const run = (source: LookSource) => {
    const key = sourceKey(source)
    if (running.has(key)) return
    running.add(key)
    if (!fetched(source))
      return settle(key, { reason: `${source.module} is not a file under ${PLUGIN_FILES}` }, true)
    let ended = false
    const end = (outcome: Outcome) => {
      const first = !ended
      ended = true
      settle(key, outcome, first)
    }
    const stop = deps.later(SETTLE_MS, () => end({ reason: `no outcome in ${SETTLE_MS} ms` }))
    void drawingOf(source).then(outcome => {
      stop()
      end(outcome)
    })
  }

  return {
    take(projection) {
      if (!newerThan(projection, worn?.projection) || same(projection, pending)) return
      if (worn !== undefined && projection.issuer !== worn.projection.issuer) {
        voided = true
        for (const listener of listeners) listener('void')
      }
      pending = undefined
      open.clear()
      const missing = new Map<string, LookSource>()
      for (const source of wanted(projection))
        if (!got.has(sourceKey(source))) missing.set(sourceKey(source), source)
      if (missing.size === 0) return wear(projection)
      pending = projection
      for (const key of missing.keys()) open.add(key)
      for (const source of missing.values()) run(source)
    },
    held: () => (voided ? undefined : worn?.projection),
    drawingAt: (point, key) => (voided ? undefined : worn?.table.get(placeKey(point, key))),
    threw(point, key, error) {
      const projection = worn?.projection
      const drawing = projection?.drawings.find(each => each.point === point && each.key === key)
      if (projection === undefined || drawing === undefined) return
      const once = JSON.stringify([point, key, projection.issuer, projection.version])
      if (told.has(once)) return
      told.add(once)
      const reason = `${drawing.source.export} threw while drawing: ${reasonOf(error)}`
      deps.up(undrawn(projection, drawing, reason))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
