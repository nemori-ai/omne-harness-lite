import type { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Member } from '@omne-harness/plugin-protocol'
import { installOn, type Code, type Listed } from '@omne-harness/plugin-ui'
import {
  RENDER_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  definePart,
  tenantScope,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const alice = tenantScope(ALICE)

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.tenant = ALICE
    this.declareOwn([
      {
        name: 'shell.app',
        label: '整个应用',
        summary: '窗口里的一切',
        depths: ['tokens', 'style'],
      },
    ])
  }

  protected override knowsToken(name: string): boolean {
    return name === '--omne-mark'
  }
}

const head = definePart<{ title: string }>({
  name: 'notes.head',
  label: '页头',
  summary: '这一页顶上的一栏',
  depths: ['tokens', 'style', 'render'],
})

const place = (name: string, version: string): string => `/bridge/plugins/${name}/${version}/`

async function world(given: Partial<Code> = { files: place }) {
  const started = await startShellOf(Framed)
  let inside: ShellService | undefined
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => head.declare(ctx.shell),
  })
  await started.root.plugin({
    name: 'loader',
    inject: ['shell'],
    apply: (ctx: Context) => void (inside = ctx.shell),
  })
  const shell = inside!
  const modules: Record<string, unknown> = {}
  const code: Code = {
    given: { React },
    load: async (_name, _version, path) => modules[path],
    ...given,
  }
  return {
    shell,
    modules,
    install: (listed: Listed) => installOn(shell, listed, alice, code),
    css: () => shell.changesFor(alice).css,
  }
}

const sea = (...members: Member[]): Listed => ({ name: 'sea', version: 'v7', members })

describe('a plugin that points at its own images', () => {
  it('a token and a style that point at a file are written with the address of that file under this plugin and this version', async () => {
    const w = await world()
    const outcome = await w.install(
      sea(
        { point: TOKENS_POINT, key: 'shell.app', data: { '--omne-mark': 'file(art/mark.svg)' } },
        {
          point: STYLE_POINT,
          key: 'notes.head',
          data: { base: { 'background-image': 'file(art/sea.webp)' } },
        },
      ),
    )
    expect(outcome.kind).toBe('installed')
    expect(w.css()).toContain('--omne-mark:url("/bridge/plugins/sea/v7/art/mark.svg");')
    expect(w.css()).toContain('background-image:url("/bridge/plugins/sea/v7/art/sea.webp");')
  })

  it('where the application gives no place for files, a member that points at one is not put, and the plugin says why', async () => {
    const w = await world({})
    const outcome = await w.install(
      sea({
        point: STYLE_POINT,
        key: 'notes.head',
        data: { base: { 'background-image': 'file(art/sea.webp)' } },
      }),
    )
    expect(outcome).toEqual({
      kind: 'failed',
      reason:
        'shell.part-style notes.head: the property background-image: file(art/sea.webp) points at a file, and what put this item gave no files',
    })
    expect(w.css()).not.toContain('sea.webp')
  })

  it('the code of a member is handed files: the address of a path inside its own package, and nothing for a path that leaves it', async () => {
    const w = await world()
    const asked: (string | undefined)[] = []
    w.modules['head.js'] = {
      head: ({
        React: R,
        files,
      }: {
        React: typeof React
        files: { url(path: string): string | undefined }
      }) => {
        asked.push(
          files.url('art/girl.webp'),
          files.url('../other/x.png'),
          files.url('/etc/passwd'),
        )
        return () => R.createElement('img', { src: files.url('art/girl.webp'), alt: '' })
      },
    }
    const outcome = await w.install(
      sea({ point: RENDER_POINT, key: 'notes.head', module: 'head.js', export: 'head' }),
    )
    expect(outcome.kind).toBe('installed')
    expect(asked).toEqual(['/bridge/plugins/sea/v7/art/girl.webp', undefined, undefined])
    const drawn = renderToStaticMarkup(
      w.shell.drawn(head.name, () => React.createElement('i', null, 'built in'), { title: 't' }),
    )
    expect(drawn).toContain('<img src="/bridge/plugins/sea/v7/art/girl.webp" alt=""/>')
  })

  it('where the application gives no place for files, the code is handed none', async () => {
    const w = await world({})
    let given: Record<string, unknown> = {}
    w.modules['head.js'] = {
      head: (handed: Record<string, unknown>) => {
        given = handed
        return () => null
      },
    }
    await w.install(
      sea({ point: RENDER_POINT, key: 'notes.head', module: 'head.js', export: 'head' }),
    )
    expect('files' in given).toBe(false)
  })
})
