import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  changesOn,
  definePart,
  tenantScope,
  valueFault,
  type PartDeclaration,
} from '@omne-harness/shell-contract'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const FILES = '/bridge/plugins/sea/v1/'

describe('a value that points at a file of the package that put it', () => {
  it('is whole when the path is inside the package, names an image, and the item came with the place of its files', () => {
    expect(valueFault('file(art/sea.webp) no-repeat center', FILES)).toBeNull()
    expect(valueFault('file( art/mark.svg ), linear-gradient(red, blue)', FILES)).toBe(
      'the value calls linear-gradient(, which a value may not call',
    )
  })

  it.each(['file(sea.png)', 'file(art/sea/deep/a.png)'])(
    'takes a path of one segment or of many: %s',
    value => {
      expect(valueFault(value, FILES)).toBeNull()
    },
  )

  it.each([
    ['file(../x.png)', 'file(../x.png) is not a path inside the package'],
    ['file(art/./x.png)', 'file(art/./x.png) is not a path inside the package'],
    ['file(/etc/x.png)', 'file(/etc/x.png) is not a path inside the package'],
    ['file(art/a b.png)', 'file(art/a b.png) is not a path inside the package'],
    ['file()', 'file() is not a path inside the package'],
    ['file(art/font.woff2)', 'file(art/font.woff2) does not name an image'],
    ['file(art/page.html)', 'file(art/page.html) does not name an image'],
    ['file(art/a.png.js)', 'file(art/a.png.js) does not name an image'],
  ])('%s is refused: %s', (value, reason) => {
    expect(valueFault(value, FILES)).toBe(reason)
  })

  it('is refused when the item came with no place of files: a value alone points nowhere', () => {
    expect(valueFault('file(art/sea.webp)')).toBe(
      'file(art/sea.webp) points at a file, and what put this item gave no files',
    )
  })

  it.each([
    'http://elsewhere/',
    '//elsewhere/x/',
    'bridge/plugins/',
    '/bridge/plugins/sea',
    '/a"b/',
  ])('is refused when the place of the files is not a path of this application: %s', place => {
    expect(valueFault('file(art/sea.webp)', place)).toBe(
      'the place of the files of this item is not a path of this application',
    )
  })

  it('still may not write an address itself, with or without files', () => {
    expect(valueFault('url(art/sea.webp)', FILES)).toBe(
      'the value calls url(, which a value may not call',
    )
    expect(valueFault('profile(art/sea.webp)', FILES)).toBe(
      'the value calls profile(, which a value may not call',
    )
  })
})

const app: PartDeclaration = {
  name: 'shell.app',
  label: '整个应用',
  summary: '窗口里的一切',
  depths: ['tokens', 'style'],
}
const page: PartDeclaration = {
  name: 'notes.page',
  label: '一页',
  summary: '笔记的一页',
  depths: ['tokens', 'style'],
}
const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const alice = tenantScope(ALICE)
const known = (name: string): boolean => name === '--omne-accent' || name === '--omne-mark'

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.declareOwn([app])
  }
}

const place = (root: Context, name: string, put: (ctx: Context) => void): Fiber =>
  root.plugin({ name, inject: ['shell'], apply: put })

async function world() {
  const started = await startShellOf(Framed)
  await place(started.root, 'notes-ui', ctx => definePart(page).declare(ctx.shell))
  return { ...started, read: () => changesOn(started.shell.registry(), alice, known) }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

describe('the sheet of an item that points at files', () => {
  it('writes each file(path) as the address of that file under the place the item came with, in tokens and in styles', async () => {
    const w = await world()
    await place(w.root, 'sea', ctx => {
      ctx.shell.putTokens('shell.app', { '--omne-mark': 'file( art/mark.svg )' }, alice, FILES)
      ctx.shell.putStyle(
        'notes.page',
        { base: { 'background-image': 'file(art/sea.webp), file(art/mark.svg)' } },
        alice,
        FILES,
      )
    })
    await settle()
    const { css, refused } = w.read()
    expect(refused).toEqual([])
    expect(css).toContain(':root{--omne-mark:url("/bridge/plugins/sea/v1/art/mark.svg");}')
    expect(css).toContain(
      '[data-omne-part="notes.page"]{background-image:url("/bridge/plugins/sea/v1/art/sea.webp"), url("/bridge/plugins/sea/v1/art/mark.svg");}',
    )
  })

  it('an item that points at a file and came with no place of files does not count, and says why', async () => {
    const w = await world()
    await place(w.root, 'sea', ctx => {
      ctx.shell.putStyle(
        'notes.page',
        { base: { 'background-image': 'file(art/sea.webp)' } },
        alice,
      )
    })
    await settle()
    const { css, refused } = w.read()
    expect(css).not.toContain('art/sea.webp')
    expect(refused.map(out => out.reason)).toEqual([
      'the property background-image: file(art/sea.webp) points at a file, and what put this item gave no files',
    ])
  })
})
