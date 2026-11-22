import type { Contract } from '@omne-harness/dynamis'
import type { ReactNode } from 'react'
import { pointContract } from './placement.ts'
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
