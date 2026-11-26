import { ask, type Contract, type Registry, type Scope } from '@omne-harness/dynamis'
import type { ReactNode } from 'react'
import { drawingContract, pointContract } from './placement.ts'
import type { AttachedItem, AttachedLayout } from './slots.ts'

export type PointCodec<S> = Readonly<{
  encode: (value: S) => string
  decode: (text: string) => S | undefined
}>

export type PointProps<S> = Readonly<{ scope: string | undefined; subject: S }>

export type PointItem<S> = Readonly<{
  id: string
  order: number
  label?: string
  render: (props: PointProps<S>) => ReactNode
}>

export type PointContributor = Readonly<{
  contribute: (slot: 'attached', item: AttachedItem) => void
}>

export type PointHost = Readonly<{
  arranged: (anchor: string, subject: string, layout: AttachedLayout) => ReactNode
}>

export type PointDeclarer = Readonly<{ declare: (contract: Contract) => void }>

/** What a host does with its own point: it declares it once, in its `apply`. */
export type Declared = Readonly<{ contract: Contract; declare: (shell: PointDeclarer) => void }>

export type PointSink<S> = Readonly<{
  name: string
  contribute: (shell: PointContributor, item: PointItem<S>) => void
}>

export type Point<S> = PointSink<S> &
  Declared &
  Readonly<{
    slot: (shell: PointHost, subject: S, layout: AttachedLayout) => ReactNode
  }>

export type KeyedPointSink<S> = Readonly<{
  name: string
  contribute: (shell: PointContributor, key: string, item: PointItem<S>) => void
}>

export type KeyedPoint<S> = KeyedPointSink<S> &
  Declared &
  Readonly<{
    slot: (shell: PointHost, key: string, subject: S, layout: AttachedLayout) => ReactNode
  }>

export type PointDeclaration<S> = Readonly<{
  name: string
  subject: PointCodec<S>
  summary?: string
  key?: string
}>

const declared = (contract: Contract): Declared => ({
  contract,
  declare: shell => shell.declare(contract),
})

function attachedItem<S>(codec: PointCodec<S>, anchor: string, item: PointItem<S>): AttachedItem {
  return {
    ...item,
    anchor,
    render: ({ scope, subject }) => {
      const value = codec.decode(subject)
      return value === undefined ? null : item.render({ scope, subject: value })
    },
  }
}

export function definePoint<S>(declaration: PointDeclaration<S>): Point<S> {
  const { name, subject: codec } = declaration
  return {
    name,
    ...declared(pointContract(name, false, declaration)),
    slot: (shell, subject, layout) => shell.arranged(name, codec.encode(subject), layout),
    contribute: (shell, item) => shell.contribute('attached', attachedItem(codec, name, item)),
  }
}

export function defineKeyedPoint<S>(declaration: PointDeclaration<S>): KeyedPoint<S> {
  const { name, subject: codec } = declaration
  const anchorOf = (key: string): string => `${name}:${key}`
  return {
    name,
    ...declared(pointContract(name, true, declaration)),
    slot: (shell, key, subject, layout) =>
      shell.arranged(anchorOf(key), codec.encode(subject), layout),
    contribute: (shell, key, item) =>
      shell.contribute('attached', attachedItem(codec, anchorOf(key), item)),
  }
}

/** What a drawing put on a key is given: the tenant, what the host shows, and the drawing it stands in for. */
export type KeyDrawing<S> = Readonly<{
  scope: string | undefined
  subject: S
  generic: () => ReactNode
}>

export type KeyRender<S = never> = (given: KeyDrawing<S>) => ReactNode

export type DrawingSource = Readonly<{ module: string; export: string; files?: string }>

export type RenderPutter = Readonly<{
  putDrawing: (
    point: string,
    key: string,
    render: KeyRender,
    scope?: Scope,
    source?: DrawingSource,
  ) => () => unknown
}>

export type RenderDrawer = Readonly<{
  drawnAt: (
    point: string,
    key: string,
    subject: unknown,
    generic: () => ReactNode,
    frame?: (drawn: ReactNode) => ReactNode,
  ) => ReactNode
}>

export type RenderPointSink<S> = Readonly<{
  name: string
  put: (
    shell: RenderPutter,
    key: string,
    render: KeyRender<S>,
    scope?: Scope,
    source?: DrawingSource,
  ) => () => unknown
}>

export type PublicKeys = Readonly<{ keys: (point: string) => readonly string[] | undefined }>

/** The keys a point draws by: any, those the server tells now, or not known while they cannot be read. */
export type PointKeys =
  | Readonly<{ kind: 'any' }>
  | Readonly<{ kind: 'told'; keys: readonly string[] }>
  | Readonly<{ kind: 'unavailable' }>

export type RenderPoint<S> = RenderPointSink<S> &
  Declared &
  Readonly<{
    keysFrom: string | null
    keys: (server: PublicKeys | undefined) => PointKeys
    draw: (
      shell: RenderDrawer,
      key: string,
      subject: S,
      generic: () => ReactNode,
      frame?: (drawn: ReactNode) => ReactNode,
    ) => ReactNode
  }>

/** `subject` is one sentence on what a drawing is given as its subject; `example` is one member to copy, with its file. */
export type RenderPointDeclaration = Readonly<{
  name: string
  key: string
  summary: string
  keysFrom?: string
  subject?: string
  example?: string
}>

function keysOf(from: string | null, server: PublicKeys | undefined): PointKeys {
  if (from === null) return { kind: 'any' }
  const keys = server?.keys(from)
  return keys === undefined ? { kind: 'unavailable' } : { kind: 'told', keys }
}

/** A point whose host draws by key: what is put on the key, or the host's generic drawing. */
export function defineRenderPoint<S>(declaration: RenderPointDeclaration): RenderPoint<S> {
  const { name, keysFrom: from, ...words } = declaration
  const keysFrom = from ?? null
  return {
    name,
    keysFrom,
    keys: server => keysOf(keysFrom, server),
    ...declared(drawingContract({ name, ...words })),
    put: (shell, key, render, scope, source) => shell.putDrawing(name, key, render, scope, source),
    draw: (shell, key, subject, generic, frame) =>
      shell.drawnAt(name, key, subject, generic, frame),
  }
}

export type DrawingItem = Readonly<{ render: KeyRender; source?: DrawingSource }>

export type StandingDrawing = Readonly<{ item: DrawingItem; by: readonly string[] }>

export function standingDrawing(
  registry: Registry,
  point: string,
  key: string,
  asker: Scope,
): StandingDrawing | undefined {
  const answer = ask<DrawingItem>(registry, point, key, asker)
  if (answer.kind !== 'one') return undefined
  return { item: answer.entry.item, by: answer.holders.map(holder => holder.fiber) }
}

/** The drawing that stands on one key of a point for one asker; none when nothing does. */
export function drawingOn(
  registry: Registry,
  point: string,
  key: string,
  asker: Scope,
): KeyRender | undefined {
  return standingDrawing(registry, point, key, asker)?.item.render
}
