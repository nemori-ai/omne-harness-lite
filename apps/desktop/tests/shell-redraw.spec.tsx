// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { lookScope, tenantScope } from '@omne-harness/shell-contract'
import {
  DoneIcon,
  EmptyState,
  LoadingIndicator,
  NamedIcon,
  PIECES,
  RedrawProvider,
  SendIcon,
  iconNames,
} from '@omne-harness/ui-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { iconPoint, piecePoint } from '../src/page/shell/redraw.ts'
import { settle, setup } from './support/shell-setup.tsx'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'

afterEach(cleanup)

function Broken(): never {
  throw new Error('this drawing is broken')
}

let within: HTMLElement = document.body

const icons = () =>
  Array.from(within.querySelectorAll('[data-mine], [data-icon]'))
    .filter(node => node.closest('[data-mine]') === null || node.hasAttribute('data-mine'))
    .map(node => node.getAttribute('data-mine') ?? `own:${node.getAttribute('data-icon')}`)

async function shown() {
  const t = await setup({ login: 'signed-in' })
  await act(async () => {
    t.state.scope.set(ALICE)
    await settle()
  })
  within = render(
    <RedrawProvider value={t.state.redraw.draw}>
      <SendIcon size={20} className="go" />
      <DoneIcon />
    </RedrawProvider>,
  ).container
  return t
}

/** A point a plugin draws on: one item for a key, the most specific counts, and the item is a drawing. */
const takesDrawing = (
  shell: {
    described(): {
      points: readonly {
        name: string
        contract: {
          arity: string
          resolve: string
          item: { fields: Readonly<Record<string, string>> }
        }
      }[]
    }
  },
  point: string,
): boolean => {
  const contract = shell.described().points.find(each => each.name === point)?.contract
  return (
    contract?.arity === 'keyed-one' &&
    contract.resolve === 'most-specific' &&
    contract.item.fields['render'] === 'function'
  )
}

describe('the icons of the kit in the desktop shell', () => {
  it('the shell declares the point, takes drawings on it, and lists the names of the icons as its keys', async () => {
    const t = await setup({ login: 'signed-in' })
    expect(takesDrawing(t.service, 'shell.icon')).toBe(true)
    const told = t.service.described().points.find(point => point.name === 'shell.icon')
    expect(told?.dataKeys?.map(key => key.name)).toEqual(iconNames())
    expect(told?.contract.example).toContain('"point":"shell.icon"')
  })

  it('an icon is drawn by what is put on its name for the tenant on show, and by its own glyph again once that is taken back', async () => {
    const t = await shown()
    expect(icons()).toEqual(['own:send', 'own:done'])
    const brand = await t.module('brand')
    let take: (() => unknown) | undefined
    await act(async () => {
      take = iconPoint.put(
        brand.shell,
        'send',
        ({ subject, generic }) => (
          <b data-mine={`mine:${subject.name}:${String(subject.size)}:${subject.className}`}>
            {generic()}
          </b>
        ),
        tenantScope(ALICE),
      )
      await settle()
    })
    expect(icons()).toEqual(['mine:send:20:go', 'own:done'])
    expect(within.querySelector('[data-mine] svg')?.getAttribute('data-icon')).toBe('send')
    await act(async () => {
      t.state.scope.set(BOB)
      await settle()
    })
    expect(icons()).toEqual(['own:send', 'own:done'])
    await act(async () => {
      t.state.scope.set(ALICE)
      await take?.()
      await settle()
    })
    expect(icons()).toEqual(['own:send', 'own:done'])
  })

  it('an icon named by a page that the set does not have is the unknown glyph, until a plugin draws one under that name', async () => {
    const t = await shown()
    within = render(
      <RedrawProvider value={t.state.redraw.draw}>
        <NamedIcon name="weather" />
      </RedrawProvider>,
    ).container
    expect(icons()).toEqual(['own:unknown'])
    const brand = await t.module('brand')
    await act(async () => {
      iconPoint.put(
        brand.shell,
        'weather',
        ({ subject }) => <b data-mine={`mine:${subject.name}`} />,
        tenantScope(ALICE),
      )
      await settle()
    })
    expect(icons()).toEqual(['mine:weather'])
  })

  it('a drawing that throws leaves that icon as its own glyph and the other icons as they are', async () => {
    const t = await shown()
    const brand = await t.module('brand')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      iconPoint.put(brand.shell, 'send', () => <Broken />, tenantScope(ALICE))
      iconPoint.put(brand.shell, 'done', () => <b data-mine="mine:done" />, tenantScope(ALICE))
      await settle()
    })
    expect(icons()).toEqual(['own:send', 'mine:done'])
    quiet.mockRestore()
  })

  it('what is put for a look draws the icon while that look is worn, over what the tenant has on the same name', async () => {
    const t = await shown()
    const brand = await t.module('brand')
    await act(async () => {
      iconPoint.put(brand.shell, 'send', () => <b data-mine="tenant" />, tenantScope(ALICE))
      iconPoint.put(brand.shell, 'send', () => <b data-mine="sea" />, lookScope(ALICE, 'sea'))
      await settle()
    })
    expect(icons()).toEqual(['tenant', 'own:done'])
    await act(async () => {
      t.service.wear('sea')
      await settle()
    })
    expect(icons()).toEqual(['sea', 'own:done'])
    await act(async () => {
      t.service.wear(undefined)
      await settle()
    })
    expect(icons()).toEqual(['tenant', 'own:done'])
  })

  it('before a shell is bound, and after it is gone, the icons are their own glyphs', async () => {
    const t = await shown()
    const unbound = t.state.redraw.bind(() => <b data-mine="other" />)
    unbound()
    within = render(
      <RedrawProvider value={t.state.redraw.draw}>
        <DoneIcon />
      </RedrawProvider>,
    ).container
    expect(icons()).toEqual(['own:done'])
  })
})

describe('the shared pieces of the kit in the desktop shell', () => {
  it('the shell declares the point and lists the pieces as its keys', async () => {
    const t = await setup({ login: 'signed-in' })
    expect(takesDrawing(t.service, 'shell.piece')).toBe(true)
    const told = t.service.described().points.find(point => point.name === 'shell.piece')
    expect(told?.dataKeys?.map(key => key.name)).toEqual([...PIECES])
    expect(told?.contract.example).toContain('"point":"shell.piece"')
  })

  it('a piece is drawn by what is put on its name, told what the page asked of it; one that throws falls back, and the other pieces stay their own', async () => {
    const t = await setup({ login: 'signed-in' })
    await act(async () => {
      t.state.scope.set(ALICE)
      await settle()
    })
    const view = render(
      <RedrawProvider value={t.state.redraw.draw}>
        <LoadingIndicator size="sm" />
        <EmptyState title="还没有" still />
      </RedrawProvider>,
    ).container
    const seen = () => [
      view.querySelector('[data-mine]')?.getAttribute('data-mine') ?? null,
      view.querySelector('[data-loading-indicator]') !== null,
      view.querySelector('.empty-state') !== null,
    ]
    expect(seen()).toEqual([null, true, true])
    const brand = await t.module('brand')
    let take: (() => unknown) | undefined
    await act(async () => {
      take = piecePoint.put(
        brand.shell,
        'loading',
        ({ subject }) => <b data-mine={`loading:${(subject as { size: string }).size}`} />,
        tenantScope(ALICE),
      )
      await settle()
    })
    expect(seen()).toEqual(['loading:sm', false, true])
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      await take?.()
      piecePoint.put(brand.shell, 'loading', () => <Broken />, tenantScope(ALICE))
      await settle()
    })
    expect(seen()).toEqual([null, true, true])
    quiet.mockRestore()
  })
})

describe('what the shell could not read in a page it drew', () => {
  it('names a page whose icon the kit does not know, until shell.icon draws one by that name', async () => {
    const t = await shown()
    const own = await t.module('own')
    const weather = { id: 'weather', title: 'Weather', order: 50, render: () => null }
    await act(async () => {
      own.shell.contribute('pages', { ...weather, icon: 'weather' })
      own.shell.contribute('pages', { ...weather, id: 'time', icon: 'time' })
      await settle()
    })
    expect(t.service.described().troubles).toEqual([
      {
        point: 'shell.pages',
        key: '',
        id: 'weather',
        says: 'the icon "weather" is not a name the kit knows, and shell.icon draws none by it: the sidebar draws a question mark. OmneExtensionPoints show shell.icon lists the names',
      },
    ])
    await act(async () => {
      iconPoint.put(own.shell, 'weather', () => <b />, tenantScope(ALICE))
      await settle()
    })
    expect(t.service.described().troubles).toEqual([])
  })
})
