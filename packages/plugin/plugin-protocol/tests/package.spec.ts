import { describe, expect, it } from 'vitest'
import {
  judgePackage,
  memberDigest,
  type PackageFile,
  type PluginManifest,
} from '@omne-harness/plugin-protocol'

const file = (path: string, digest = `d:${path}`): PackageFile => ({ path, digest })

const MANIFEST: PluginManifest = {
  schema: 1,
  name: 'cards',
  summary: 'Cards.',
  client: {
    members: [
      { point: 'shell.tokens', key: 'shell.app', data: { tokens: {} } },
      { point: 'session.tool-call', key: 'Web', module: 'cards/web.js', export: 'webCard' },
    ],
  },
  server: { members: [{ point: 'skill.skills', key: 'tidy', directory: 'skills/tidy' }] },
}
const FILES = [
  file('plugin.json'),
  file('cards/web.js'),
  file('cards/shared.js'),
  file('cards/web.css'),
  file('skills/tidy/SKILL.md'),
  file('skills/tidy/run.sh'),
]

describe('a package judged against its manifest', () => {
  it('passes when every module and directory a member writes is in it, and its files are of the kinds it may carry', () => {
    expect(judgePackage(MANIFEST, FILES)).toEqual({ ok: true })
  })

  it.each([
    [
      'a module that is not in the package',
      FILES.filter(each => each.path !== 'cards/web.js'),
      'client.members[1]: the file cards/web.js is not in the package',
    ],
    [
      'a directory with nothing in it',
      FILES.filter(each => !each.path.startsWith('skills/')),
      'server.members[0]: the directory skills/tidy is not in the package',
    ],
    [
      'a file of a kind the package may not carry',
      [...FILES, file('cards/web.wasm')],
      'the file cards/web.wasm is not one of .js, .css, .json',
    ],
    [
      'a file whose path leaves the package',
      [...FILES, file('../outside.js')],
      'the file ../outside.js is not a path inside the package',
    ],
  ])('refuses %s', (_name, files, reason) => {
    expect(judgePackage(MANIFEST, files)).toEqual({ ok: false, reason })
  })

  it('lets the files of a directory member be of any kind, and only those', () => {
    const others = [...FILES, file('skills/other/SKILL.md')]
    expect(judgePackage(MANIFEST, others)).toEqual({
      ok: false,
      reason: 'the file skills/other/SKILL.md is not one of .js, .css, .json',
    })
  })
})

describe('a package of a manifest with one side, or with two directories', () => {
  it('is judged by the side it has', () => {
    const { server: _server, ...clientOnly } = MANIFEST
    const files = FILES.filter(each => !each.path.startsWith('skills/'))
    expect(judgePackage(clientOnly, files)).toEqual({ ok: true })
  })

  it('lets a file be under any one of its directory members', () => {
    const two: PluginManifest = {
      ...MANIFEST,
      server: {
        members: [
          ...MANIFEST.server!.members,
          { point: 'skill.skills', key: 'other', directory: 'skills/other' },
        ],
      },
    }
    expect(judgePackage(two, [...FILES, file('skills/other/SKILL.md')])).toEqual({ ok: true })
  })
})

describe('the digest of a member', () => {
  const [tokens, card] = MANIFEST.client!.members
  const [skill] = MANIFEST.server!.members

  it('of data is its text in the manifest, whatever the order its fields were written in', () => {
    const again = { data: { tokens: {} }, key: 'shell.app', point: 'shell.tokens' }
    expect(memberDigest(tokens!, FILES)).toBe(memberDigest(again, FILES))
    expect(memberDigest(tokens!, FILES)).toBe(memberDigest(tokens!, []))
    expect(memberDigest(tokens!, FILES)).not.toBe(
      memberDigest({ ...tokens!, data: { tokens: { '--omne-accent': '#0a7' } } }, FILES),
    )
  })

  it('of data tells a list from an object, and takes null', () => {
    const data = (value: unknown) =>
      memberDigest({ point: 'p.q', key: 'k', data: value as never }, [])
    expect(data([1, 2])).not.toBe(data({ 0: 1, 1: 2 }))
    expect(data(null)).not.toBe(data({}))
    expect(data({ a: null })).toBe(data({ a: null }))
  })

  it('of a module changes with its file, and not with another file', () => {
    const base = memberDigest(card!, FILES)
    const edited = FILES.map(each =>
      each.path === 'cards/web.js' ? file(each.path, 'd:new') : each,
    )
    const other = FILES.map(each =>
      each.path === 'cards/web.css' ? file(each.path, 'd:new') : each,
    )
    expect(memberDigest(card!, edited)).not.toBe(base)
    expect(memberDigest(card!, other)).toBe(base)
    expect(memberDigest({ ...card!, export: 'another' } as never, FILES)).not.toBe(base)
  })

  it('of a directory changes with any file under it, whatever the order the files are listed in', () => {
    const base = memberDigest(skill!, FILES)
    expect(memberDigest(skill!, [...FILES].reverse())).toBe(base)
    const edited = FILES.map(each =>
      each.path === 'skills/tidy/run.sh' ? file(each.path, 'd:new') : each,
    )
    expect(memberDigest(skill!, edited)).not.toBe(base)
    expect(memberDigest(skill!, [...FILES, file('skills/tidy-more/x.md')])).toBe(base)
  })
})
