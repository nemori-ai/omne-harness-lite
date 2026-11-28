import { describe, expect, it } from 'vitest'
import {
  MANIFEST_FILE,
  memberKind,
  readManifest,
  type PluginManifest,
} from '@omne-harness/plugin-protocol'

const GREEN: PluginManifest = {
  schema: 1,
  name: 'brand-green',
  summary: 'The accent of the application in green.',
  client: {
    members: [
      { point: 'shell.tokens', key: 'shell.app', data: { tokens: { '--omne-accent': '#0a7a4a' } } },
      { point: 'session.tool-call', key: 'Web', module: 'cards/web.js', export: 'webCard' },
    ],
  },
  server: {
    needs: ['extensions'],
    members: [{ point: 'skill.skills', key: 'tidy', directory: 'skills/tidy' }],
  },
}

const text = (value: unknown): string => JSON.stringify(value)
const refusal = (value: unknown): string => {
  const read = readManifest(typeof value === 'string' ? value : text(value))
  if (read.kind !== 'refused') throw new Error('the manifest was read')
  return read.reason
}
const withMember = (member: unknown): unknown => ({ ...GREEN, client: { members: [member] } })

describe('the manifest of a plugin', () => {
  it('is the file plugin.json, read as it is written: its sides, and each member one item on one point', () => {
    expect(MANIFEST_FILE).toBe('plugin.json')
    expect(readManifest(text(GREEN))).toStrictEqual({ kind: 'read', manifest: GREEN, unread: [] })
    expect(GREEN.client?.members.map(memberKind)).toEqual(['data', 'module'])
    expect(GREEN.server?.members.map(memberKind)).toEqual(['directory'])
  })

  it('may have one side only, or none; fields it does not know are left out', () => {
    const { server: _server, ...clientOnly } = GREEN
    expect(readManifest(text(clientOnly))).toEqual({
      kind: 'read',
      manifest: clientOnly,
      unread: [],
    })
    const bare = { schema: 1, name: 'bare', summary: 'Nothing yet.' }
    expect(readManifest(text({ ...bare, version: '1', later: true }))).toEqual({
      kind: 'read',
      manifest: bare,
      unread: ['later', 'version'],
    })
  })

  it.each([
    ['text that is not JSON', '{ not json', 'the manifest is not JSON'],
    ['a list', [], 'the manifest is not an object'],
    ['null', null, 'the manifest is not an object'],
    ['a summary that is not text', { ...GREEN, summary: 5 }, 'the summary is empty'],
    [
      'needs with one that is not a name',
      { ...GREEN, server: { needs: ['extensions', 1], members: [] } },
      'server.needs is not a list of names',
    ],
    [
      'needs with an empty name',
      { ...GREEN, server: { needs: [''], members: [] } },
      'server.needs is not a list of names',
    ],
    [
      'another schema',
      { ...GREEN, schema: 2 },
      'the manifest is of schema 2; this reader knows schema 1',
    ],
    [
      'no schema',
      { name: 'x', summary: 'y' },
      'the manifest is of schema undefined; this reader knows schema 1',
    ],
    [
      'a name with capitals',
      { ...GREEN, name: 'Brand' },
      'the name "Brand" is not lower-case letters, digits and hyphens',
    ],
    [
      'a name with a slash',
      { ...GREEN, name: 'a/b' },
      'the name "a/b" is not lower-case letters, digits and hyphens',
    ],
    ['an empty summary', { ...GREEN, summary: ' ' }, 'the summary is empty'],
    [
      'a name that is not text',
      { ...GREEN, name: true },
      'the name true is not lower-case letters, digits and hyphens',
    ],
    [
      'a name that is null',
      { ...GREEN, name: null },
      'the name null is not lower-case letters, digits and hyphens',
    ],
    ['a side that is not an object', { ...GREEN, client: [] }, 'client is not an object'],
    [
      'members that are not a list',
      { ...GREEN, client: { members: {} } },
      'client.members is not a list',
    ],
    [
      'needs that are not names',
      { ...GREEN, server: { needs: [1], members: [] } },
      'server.needs is not a list of names',
    ],
  ])('refuses %s and says why', (_name, value, reason) => {
    expect(refusal(value)).toBe(reason)
  })

  it.each([
    ['is not an object', 'words', 'client.members[0] is not an object'],
    ['is null', null, 'client.members[0] is not an object'],
    ['names a blank point', { point: '  ', key: 'k', data: 1 }, 'client.members[0] names no point'],
    [
      'writes a module with an empty export',
      { point: 'p.q', key: 'k', module: 'a.js', export: '' },
      'client.members[0] writes a module without the name of its export',
    ],
    [
      'writes a path that is not text',
      { point: 'p.q', key: 'k', directory: 5 },
      'client.members[0]: 5 is not a path inside the package',
    ],
    [
      'writes a path with a step in place',
      { point: 'p.q', key: 'k', directory: 'a/./b' },
      'client.members[0]: a/./b is not a path inside the package',
    ],
    [
      'writes a path that begins with a sign',
      { point: 'p.q', key: 'k', directory: '!a' },
      'client.members[0]: !a is not a path inside the package',
    ],
    [
      'writes a path that ends with a sign',
      { point: 'p.q', key: 'k', directory: 'a!' },
      'client.members[0]: a! is not a path inside the package',
    ],
    [
      'writes a path with an empty segment',
      { point: 'p.q', key: 'k', directory: 'a//b' },
      'client.members[0]: a//b is not a path inside the package',
    ],
    ['names no point', { key: 'k', data: 1 }, 'client.members[0] names no point'],
    ['has no key', { point: 'p.q', data: 1 }, 'client.members[0] has no key'],
    [
      'writes none of the three',
      { point: 'p.q', key: 'k' },
      'client.members[0] writes none of data, directory and module',
    ],
    [
      'writes two of the three',
      { point: 'p.q', key: 'k', data: 1, module: 'a.js', export: 'a' },
      'client.members[0] writes data and module; a member writes one',
    ],
    [
      'writes a module without its export',
      { point: 'p.q', key: 'k', module: 'a.js' },
      'client.members[0] writes a module without the name of its export',
    ],
    [
      'writes a module that is not a .js file',
      { point: 'p.q', key: 'k', module: 'a.ts', export: 'a' },
      'client.members[0]: the module a.ts is not a .js file',
    ],
    [
      'writes a path that leaves the package',
      { point: 'p.q', key: 'k', module: '../a.js', export: 'a' },
      'client.members[0]: ../a.js is not a path inside the package',
    ],
    [
      'writes an absolute path',
      { point: 'p.q', key: 'k', directory: '/etc' },
      'client.members[0]: /etc is not a path inside the package',
    ],
    [
      'has an id that is not text',
      { point: 'p.q', key: 'k', data: 1, id: 3 },
      'client.members[0] has an id that is not text',
    ],
    [
      'has a rank that is not a number',
      { point: 'p.q', key: 'k', data: 1, rank: 'first' },
      'client.members[0] has a rank that is not a number',
    ],
  ])('refuses a member that %s, naming the member', (_name, member, reason) => {
    expect(refusal(withMember(member))).toBe(reason)
  })

  it('says what it is in kind: nothing written is a plain plugin, skin is a skin', () => {
    const { server: _server, ...clientOnly } = GREEN
    const plain = readManifest(text(clientOnly))
    expect(plain.kind === 'read' && 'kind' in plain.manifest).toBe(false)
    const skin = { ...clientOnly, kind: 'skin' }
    expect(readManifest(text(skin))).toStrictEqual({ kind: 'read', manifest: skin, unread: [] })
  })

  it.each([['theme'], ['Skin'], [''], [null], [1], [['skin']]])(
    'refuses the kind %j, which it does not know, and says which it knows: it is not read as a plain plugin',
    kind => {
      expect(refusal({ ...GREEN, kind })).toBe(
        `the kind ${JSON.stringify(kind)} is not one this reader knows; it knows skin`,
      )
    },
  )

  it('names the side and the place of the member it refuses', () => {
    const value = {
      ...GREEN,
      server: { members: [GREEN.server!.members[0], { point: 'p.q', key: 'k' }] },
    }
    expect(refusal(value)).toBe('server.members[1] writes none of data, directory and module')
  })

  it('keeps the id and the rank a member writes, and null as data', () => {
    const member = { point: 'p.q', key: 'k', id: 'one', rank: 3, data: null }
    expect(readManifest(text(withMember(member)))).toMatchObject({
      kind: 'read',
      manifest: { client: { members: [member] } },
    })
  })
})

it('a rank too large to be a number is refused', () => {
  const written =
    '{"schema":1,"name":"x","summary":"y","client":{"members":[{"point":"p.q","key":"k","data":1,"rank":1e999}]}}'
  expect(readManifest(written)).toEqual({
    kind: 'refused',
    reason: 'client.members[0] has a rank that is not a number',
  })
})
