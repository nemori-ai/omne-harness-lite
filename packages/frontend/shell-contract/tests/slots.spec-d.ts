import { expectTypeOf, test } from 'vitest'
import type { ReactNode } from 'react'
import {
  defineKeyedPoint,
  definePoint,
  type KeyedPointSink,
  type PointCodec,
  type PointContributor,
  type PointHost,
  type PointItem,
  type PointSink,
} from '@omne-harness/shell-contract'
import type {
  AttachedEntry,
  AttachedItem,
  AttachedLayout,
  AttachedProps,
  GateItem,
  GateProps,
  ItemOf,
  PageItem,
  ScopedProps,
  ShellLogin,
  ShellLoginState,
  ShellSlots,
  SidebarItem,
  SlotName,
} from '@omne-harness/shell-contract'
import { ShellService, defineUiModule } from '@omne-harness/shell-contract/cordis'

test('each slot takes its own item', () => {
  expectTypeOf<SlotName>().toEqualTypeOf<'gate' | 'pages' | 'sidebar' | 'attached'>()
  expectTypeOf<ItemOf<'gate'>>().toEqualTypeOf<GateItem>()
  expectTypeOf<ItemOf<'pages'>>().toEqualTypeOf<PageItem>()
  expectTypeOf<ItemOf<'sidebar'>>().toEqualTypeOf<SidebarItem>()
  expectTypeOf<ItemOf<'attached'>>().toEqualTypeOf<AttachedItem>()
  expectTypeOf<AttachedItem>().toEqualTypeOf<
    Readonly<{
      id: string
      order: number
      anchor: string
      label?: string
      render: (props: AttachedProps) => ReactNode
    }>
  >()
  expectTypeOf<AttachedEntry>().toEqualTypeOf<
    Readonly<{ id: string; label: string | undefined; node: ReactNode }>
  >()
  expectTypeOf<AttachedLayout>().toEqualTypeOf<(entries: readonly AttachedEntry[]) => ReactNode>()
  expectTypeOf<PageItem['badge']>().toEqualTypeOf<((props: ScopedProps) => ReactNode) | undefined>()
  expectTypeOf<GateItem>().toEqualTypeOf<
    Readonly<{ id: string; render: (props: GateProps) => ReactNode }>
  >()
  expectTypeOf<PageItem>().toEqualTypeOf<
    Readonly<{
      id: string
      title: string
      order: number
      icon?: string
      badge?: (props: ScopedProps) => ReactNode
      render: (props: ScopedProps) => ReactNode
    }>
  >()
  expectTypeOf<SidebarItem>().toEqualTypeOf<
    Readonly<{ id: string; order: number; render: (props: ScopedProps) => ReactNode }>
  >()
})

test('the render properties: the gate gets no tenant, the others get the tenant text', () => {
  expectTypeOf<keyof GateProps>().toBeNever()
  expectTypeOf<ScopedProps>().toEqualTypeOf<Readonly<{ scope: string | undefined }>>()
  expectTypeOf<AttachedProps>().toEqualTypeOf<
    Readonly<{ scope: string | undefined; subject: string }>
  >()
})

test('contribute refuses an item that belongs to another slot', () => {
  const shell = null as unknown as ShellService
  const render = (): null => null
  shell.contribute('gate', { id: 'g', render })
  shell.contribute('pages', { id: 'p', title: 'P', order: 0, render })
  shell.contribute('sidebar', { id: 's', order: 0, render })
  shell.contribute('attached', { id: 'a', order: 0, anchor: 'x', render })
  // @ts-expect-error an attached item needs an anchor
  shell.contribute('attached', { id: 'a', order: 0, render })
  // @ts-expect-error a gate item has no title and order
  shell.contribute('pages', { id: 'g', render })
  // @ts-expect-error a page item does not belong in the gate
  shell.contribute('gate', { id: 'p', title: 'P', order: 0, render })
  // @ts-expect-error there is no fifth slot
  shell.contribute('footer', { id: 'f', render })
})

test('the slots reader and the service members', () => {
  expectTypeOf<ShellSlots['items']>().toBeCallableWith('pages')
  expectTypeOf<ShellService['navigate']>().toEqualTypeOf<(pageId: string) => void>()
  expectTypeOf<ShellService['attached']>().toEqualTypeOf<
    (anchor: string, subject: string) => ReactNode
  >()
  expectTypeOf<ShellService['scope']['get']>().toEqualTypeOf<() => string | undefined>()
  expectTypeOf<ShellService['login']['logout']>().returns.resolves.toEqualTypeOf<
    'signed-out' | 'unknown'
  >()
})

test('the login port is self-contained and states the client assembly login states', () => {
  expectTypeOf<ShellLoginState>().toEqualTypeOf<
    'signed-out' | 'signing-in' | 'signed-in' | 'signing-out'
  >()
  expectTypeOf<ShellLogin['state']>().toEqualTypeOf<() => ShellLoginState>()
  expectTypeOf<ShellLogin['subscribe']>().toEqualTypeOf<
    (listener: (state: ShellLoginState) => void) => () => void
  >()
  expectTypeOf<ShellLogin['login']>().returns.resolves.toEqualTypeOf<
    'signed-in' | 'auth-failed' | 'unknown' | 'unavailable'
  >()
})

test('defineUiModule hands the listed services with their types', () => {
  defineUiModule<{ clock: { now: number } }>({
    name: 'clock-ui',
    inject: ['clock'],
    apply(_shell, services) {
      expectTypeOf(services.clock.now).toBeNumber()
    },
  })
  // @ts-expect-error a name outside the declared services cannot be listed
  defineUiModule<{ clock: { now: number } }>({ name: 'x', inject: ['other'], apply() {} })
})

type Session = Readonly<{ session: string }>
type TitledSession = Readonly<{ session: string; title: string }>

test('a point takes no key and a keyed point requires one, on both sides', () => {
  const codec: PointCodec<Session> = {
    encode: value => value.session,
    decode: text => ({ session: text }),
  }
  const plain = definePoint({ name: 'session.side', subject: codec })
  const keyed = defineKeyedPoint({ name: 'assets.holding', subject: codec })
  expectTypeOf(plain.contribute).parameters.toEqualTypeOf<[PointContributor, PointItem<Session>]>()
  expectTypeOf(plain.slot).parameters.toEqualTypeOf<[PointHost, Session, AttachedLayout]>()
  expectTypeOf(keyed.contribute).parameters.toEqualTypeOf<
    [PointContributor, string, PointItem<Session>]
  >()
  expectTypeOf(keyed.slot).parameters.toEqualTypeOf<[PointHost, string, Session, AttachedLayout]>()
  expectTypeOf<PointItem<Session>['render']>().toEqualTypeOf<
    (props: Readonly<{ scope: string | undefined; subject: Session }>) => ReactNode
  >()
})

test('the sink of a wider subject serves a contributor that needs fewer fields, and not the reverse', () => {
  expectTypeOf<PointSink<TitledSession>>().toExtend<PointSink<Session>>()
  expectTypeOf<PointSink<Session>>().not.toExtend<PointSink<TitledSession>>()
  expectTypeOf<KeyedPointSink<TitledSession>>().toExtend<KeyedPointSink<Session>>()
  expectTypeOf<KeyedPointSink<Session>>().not.toExtend<KeyedPointSink<TitledSession>>()
  expectTypeOf<PointSink<Session>>().not.toExtend<PointSink<Readonly<{ session: number }>>>()
})

test('the shell service serves both sides of a point', () => {
  expectTypeOf<ShellService>().toExtend<PointContributor>()
  expectTypeOf<ShellService>().toExtend<PointHost>()
})
