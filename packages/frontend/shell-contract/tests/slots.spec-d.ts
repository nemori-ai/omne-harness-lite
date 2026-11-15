import { expectTypeOf, test } from 'vitest'
import type { ReactNode } from 'react'
import type {
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
  expectTypeOf<SlotName>().toEqualTypeOf<'gate' | 'pages' | 'sidebar'>()
  expectTypeOf<ItemOf<'gate'>>().toEqualTypeOf<GateItem>()
  expectTypeOf<ItemOf<'pages'>>().toEqualTypeOf<PageItem>()
  expectTypeOf<ItemOf<'sidebar'>>().toEqualTypeOf<SidebarItem>()
  expectTypeOf<GateItem>().toEqualTypeOf<
    Readonly<{ id: string; render: (props: GateProps) => ReactNode }>
  >()
  expectTypeOf<PageItem>().toEqualTypeOf<
    Readonly<{
      id: string
      title: string
      order: number
      icon?: string
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
})

test('contribute refuses an item that belongs to another slot', () => {
  const shell = null as unknown as ShellService
  const render = (): null => null
  shell.contribute('gate', { id: 'g', render })
  shell.contribute('pages', { id: 'p', title: 'P', order: 0, render })
  shell.contribute('sidebar', { id: 's', order: 0, render })
  // @ts-expect-error a gate item has no title and order
  shell.contribute('pages', { id: 'g', render })
  // @ts-expect-error a page item does not belong in the gate
  shell.contribute('gate', { id: 'p', title: 'P', order: 0, render })
  // @ts-expect-error there is no fourth slot
  shell.contribute('footer', { id: 'f', render })
})

test('the slots reader and the service members', () => {
  expectTypeOf<ShellSlots['items']>().toBeCallableWith('pages')
  expectTypeOf<ShellService['navigate']>().toEqualTypeOf<(pageId: string) => void>()
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
