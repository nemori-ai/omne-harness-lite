import { expectTypeOf, test } from 'vitest'
import type { ReactNode } from 'react'
import {
  defineKeyedPoint,
  definePoint,
  needPoint,
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
  FigureReport,
  FloatCorner,
  FloatItem,
  FloatProps,
  GateItem,
  GateProps,
  ItemOf,
  PageItem,
  PageProps,
  ScopedProps,
  Toast,
  ShellLogin,
  ShellLoginState,
  ShellSlots,
  SidebarItem,
  SlotName,
} from '@omne-harness/shell-contract'
import { ShellService, defineUiModule } from '@omne-harness/shell-contract/cordis'

test('each slot takes its own item', () => {
  expectTypeOf<SlotName>().toEqualTypeOf<'gate' | 'pages' | 'sidebar' | 'float' | 'attached'>()
  expectTypeOf<ItemOf<'gate'>>().toEqualTypeOf<GateItem>()
  expectTypeOf<ItemOf<'pages'>>().toEqualTypeOf<PageItem>()
  expectTypeOf<ItemOf<'sidebar'>>().toEqualTypeOf<SidebarItem>()
  expectTypeOf<ItemOf<'float'>>().toEqualTypeOf<FloatItem>()
  expectTypeOf<ItemOf<'attached'>>().toEqualTypeOf<AttachedItem>()
  expectTypeOf<FloatItem>().toEqualTypeOf<
    Readonly<{ id: string; order: number; render: (props: FloatProps) => ReactNode }>
  >()
  expectTypeOf<FloatProps>().toEqualTypeOf<
    Readonly<{
      scope: string | undefined
      grip: Readonly<{ 'data-omne-float-grip': '' }>
      corner: FloatCorner
      dragging: boolean
    }>
  >()
  expectTypeOf<FloatCorner>().toEqualTypeOf<Readonly<{ x: 'start' | 'end'; y: 'start' | 'end' }>>()
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
      icon: string
      group?: 'primary' | 'utility'
      badge?: (props: ScopedProps) => ReactNode
      render: (props: PageProps) => ReactNode
    }>
  >()
  expectTypeOf<SidebarItem>().toEqualTypeOf<
    Readonly<{
      id: string
      order: number
      group?: 'primary' | 'utility'
      rail?: (props: ScopedProps) => ReactNode
      render: (props: ScopedProps) => ReactNode
    }>
  >()
})

test('a page always names its icon; a page and a sidebar item may name their group, and a sidebar item its rail', () => {
  const shell = null as unknown as ShellService
  const render = (): null => null
  shell.contribute('pages', { id: 'p', title: 'P', order: 0, icon: 'settings', render })
  shell.contribute('pages', {
    id: 'u',
    title: 'U',
    order: 0,
    icon: 'settings',
    group: 'utility',
    render,
  })
  shell.contribute('sidebar', { id: 's', order: 0, group: 'primary', render })
  shell.contribute('sidebar', { id: 'a', order: 0, group: 'utility', rail: render, render })
  // @ts-expect-error a page item needs an icon
  shell.contribute('pages', { id: 'p', title: 'P', order: 0, render })
  shell.contribute('pages', {
    id: 'p',
    title: 'P',
    order: 0,
    icon: 'settings',
    // @ts-expect-error there is no third group
    group: 'footer',
    render,
  })
  shell.contribute('sidebar', {
    id: 's',
    order: 0,
    // @ts-expect-error a rail gets the tenant text like the item it folds
    rail: (props: { subject: string }) => props.subject,
    render,
  })
})

test('the render properties: the gate gets no tenant, the others get the tenant text', () => {
  expectTypeOf<keyof GateProps>().toBeNever()
  expectTypeOf<ScopedProps>().toEqualTypeOf<Readonly<{ scope: string | undefined }>>()
  expectTypeOf<PageProps>().toEqualTypeOf<
    Readonly<{ scope: string | undefined; subject?: string }>
  >()
  expectTypeOf<AttachedProps>().toEqualTypeOf<
    Readonly<{ scope: string | undefined; subject: string }>
  >()
})

test('contribute refuses an item that belongs to another slot', () => {
  const shell = null as unknown as ShellService
  const render = (): null => null
  shell.contribute('gate', { id: 'g', render })
  shell.contribute('pages', { id: 'p', title: 'P', order: 0, icon: 'topics', render })
  shell.contribute('sidebar', { id: 's', order: 0, render })
  shell.contribute('attached', { id: 'a', order: 0, anchor: 'test.x', render })
  // @ts-expect-error an attached item needs an anchor
  shell.contribute('attached', { id: 'a', order: 0, render })
  // @ts-expect-error a gate item has no title and order
  shell.contribute('pages', { id: 'g', render })
  // @ts-expect-error a page item does not belong in the gate
  shell.contribute('gate', { id: 'p', title: 'P', order: 0, icon: 'topics', render })
  // @ts-expect-error there is no fifth slot
  shell.contribute('footer', { id: 'f', render })
})

test('the slots reader and the service members', () => {
  expectTypeOf<ShellSlots['items']>().toBeCallableWith('pages')
  expectTypeOf<ShellService['navigate']>().toEqualTypeOf<
    (pageId: string, subject?: string) => void
  >()
  expectTypeOf<ShellService['toast']>().toEqualTypeOf<(toast: Toast) => void>()
  expectTypeOf<ShellService['figure']>().toEqualTypeOf<(report: FigureReport) => void>()
  expectTypeOf<FigureReport>().toEqualTypeOf<
    Readonly<{
      doing: 'idle' | 'thinking' | 'looking' | 'writing' | 'background'
      moment?: Readonly<{ kind: 'received' | 'landed' | 'could-not'; serial: number }>
      subject?: string
      waiting?: number
      waitingPage?: string
    }>
  >()
  expectTypeOf<Toast>().toEqualTypeOf<
    Readonly<{
      id: string
      tone: 'info' | 'attention'
      title: string
      body?: string
      action?: Readonly<{ label: string; page: string; subject?: string }>
    }>
  >()
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

test('defineUiModule hands the declared point needs with their types', () => {
  defineUiModule({
    name: 'clock-ui',
    needs: { clock: needPoint<{ now: number }>('host.clock') },
    apply(_shell, bound) {
      expectTypeOf(bound.clock.get()).toEqualTypeOf<{ now: number } | undefined>()
    },
  })
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
