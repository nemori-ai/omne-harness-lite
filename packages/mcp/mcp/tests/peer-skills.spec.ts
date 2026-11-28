import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { SkillCatalogRecord } from '@omne-harness/mcp-contract'
import {
  createMemoryCatalogStore,
  endpointRefOf,
  jsonOf,
  peerIdentityOf,
} from '@omne-harness/mcp-contract/testing'
import { createMcp } from '../src/index.ts'
import { createSkillFileCache, sliceText } from '../src/internal/skill-files.ts'
import { alice, mallory } from './doubles/identities.ts'
import type { Step } from './doubles/scripted-transport.ts'
import { adoptHttp, page, world } from './doubles/world.ts'

const desk = endpointRefOf('desk')
const offering = {
  ...peerIdentityOf(),
  capabilities: jsonOf({
    tools: {},
    resources: {},
    extensions: { 'io.modelcontextprotocol/skills': {} },
  }),
}
const ROOT = 'skill://docs/style'
const SKILL_MD =
  '---\nname: style\ndescription: House style.\n---\n# Style\nShort sentences: 短句。\n'
const TONE = 'Be plain.\n'
const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
const size = (text: string) => Buffer.byteLength(text)
const listed = (path: string, text: string) => ({
  uri: `${ROOT}/${path}`,
  digest: sha(text),
  size: size(text),
})

const entryOf = (overrides: Record<string, unknown> = {}) =>
  jsonOf({
    uri: `${ROOT}/SKILL.md`,
    frontmatter: { name: 'style', description: 'House style.' },
    resources: [listed('SKILL.md', SKILL_MD), listed('references/tone.md', TONE)],
    ...overrides,
  })
const named = (name: string) =>
  jsonOf({
    uri: `skill://docs/${name}/SKILL.md`,
    frontmatter: { name, description: `${name} notes.` },
    resources: [{ uri: `skill://docs/${name}/SKILL.md`, digest: sha('x'), size: 1 }],
  })
const text = (path: string, body: string) => ({
  readResource: { uri: `${ROOT}/${path}`, text: body },
})

const LISTED: readonly Step[] = [
  { discover: offering },
  { listActions: page(['read']) },
  { listSkills: { skills: [entryOf()] } },
]

function skillWorld(script: readonly Step[]) {
  const w = world({ script })
  const skillStore = createMemoryCatalogStore<SkillCatalogRecord>()
  const mcp = createMcp({ ...w.ports, skillStore }, w.config)
  adoptHttp(w, desk, { auth: 'none' })
  return { w, mcp, skillStore }
}

const read = (path: string, start = 0, length = 4096) => ({
  skill: 'style',
  path,
  range: { start, length },
})
const calls = (w: ReturnType<typeof world>, kind: string) =>
  w.transports.calls.filter(call => call.kind === kind)

describe('the skills of a peer (C403)', () => {
  it('are taken whole across pages with the catalog of actions; dynamic ones and two of one name are not, each with why; nothing is read yet', async () => {
    const { w, mcp } = skillWorld([
      { discover: offering },
      { listActions: page(['read']) },
      { listSkills: { skills: [entryOf(), named('twin')], nextCursor: 'p2' } },
      {
        listSkills: {
          skills: [
            named('twin'),
            entryOf({
              uri: 'skill://live/SKILL.md',
              frontmatter: { name: 'live', description: 'x' },
              resources: 'dynamic',
            }),
          ],
        },
      },
    ])
    expect(await mcp.discovery.skills(alice, desk)).toEqual({ ok: { kind: 'not-acquired' } })
    await mcp.discovery.refresh(alice, { ref: desk })
    const view = await mcp.discovery.skills(alice, desk)
    if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error(JSON.stringify(view))
    expect(view.ok.skills.map(skill => [skill.name, skill.files.map(file => file.path)])).toEqual([
      ['style', ['SKILL.md', 'references/tone.md']],
    ])
    expect(view.ok.refused.map(one => [one.name, one.reason])).toEqual([
      ['twin', 'same-name'],
      ['twin', 'same-name'],
      ['live', 'dynamic'],
    ])
    expect(calls(w, 'listSkills')).toMatchObject([{ cursor: undefined }, { cursor: 'p2' }])
    expect(calls(w, 'readResource')).toEqual([])
  })

  it('a peer without resources or the extension is told as not offering skills, and is not asked', async () => {
    const { w, mcp } = skillWorld([{ discover: peerIdentityOf() }, { listActions: page(['read']) }])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({ ok: { kind: 'not-declared' } })
    expect(calls(w, 'listSkills')).toEqual([])
    expect(await mcp.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      failure: { kind: 'skill-not-found' },
    })
  })

  it('a listing that fails keeps what was published before', async () => {
    const { mcp } = skillWorld([
      ...LISTED,
      { listActions: page(['read']) },
      { listSkills: { kind: 'no-answer', cause: 'abandoned' } },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
      ok: { kind: 'acquired', revision: 1, skills: [{ name: 'style' }] },
    })
  })
})

describe('reading a file of a peer skill (C402, MC-39)', () => {
  it('reads a listed file when asked, checks it, gives a range cut at whole characters, and reads it from memory the next time', async () => {
    const { w, mcp } = skillWorld([...LISTED, text('SKILL.md', SKILL_MD)])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      ok: { text: SKILL_MD, start: 0, total: size(SKILL_MD) },
    })
    const wide = size(SKILL_MD) - size('短句。\n')
    expect(await mcp.skills.read(alice, desk, read('SKILL.md', wide + 1, 4))).toEqual({
      ok: { text: '句', start: wide + 3, total: size(SKILL_MD) },
    })
    expect(await mcp.skills.read(alice, desk, read('SKILL.md', wide, 1))).toEqual({
      ok: { text: '短', start: wide, total: size(SKILL_MD) },
    })
    expect(calls(w, 'readResource')).toMatchObject([{ uri: `${ROOT}/SKILL.md` }])
  })

  it.each([
    ['one byte changed', text('references/tone.md', 'Be plaiN.\n')],
    [
      'bytes as base64 that differ',
      { readResource: { uri: `${ROOT}/references/tone.md`, blob: btoa('Be loud!!\n') } },
    ],
  ] as const)(
    'answers changed and gives nothing for %s, and takes the entry the peer gives now',
    async (_, answer) => {
      const { w, mcp } = skillWorld([
        ...LISTED,
        answer,
        { getSkill: entryOf({ frontmatter: { name: 'style', description: 'Newer style.' } }) },
      ])
      await mcp.discovery.refresh(alice, { ref: desk })
      expect(await mcp.skills.read(alice, desk, read('references/tone.md'))).toEqual({
        failure: { kind: 'changed' },
      })
      expect(calls(w, 'getSkill')).toMatchObject([{ uri: `${ROOT}/SKILL.md` }])
      expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
        ok: { revision: 2, skills: [{ description: { untrusted: 'Newer style.' } }] },
      })
    },
  )

  it('answers changed for a SKILL.md of the listed bytes whose frontmatter is not the entry', async () => {
    const { mcp } = skillWorld([
      { discover: offering },
      { listActions: page(['read']) },
      {
        listSkills: {
          skills: [entryOf({ frontmatter: { name: 'style', description: 'Listed style.' } })],
        },
      },
      text('SKILL.md', SKILL_MD),
      { getSkill: entryOf() },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      failure: { kind: 'changed' },
    })
  })

  it('answers changed for a file the listing does not name, without reading it, and asks for the entry again', async () => {
    const { w, mcp } = skillWorld([...LISTED, { getSkill: entryOf() }])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('references/extra.md'))).toEqual({
      failure: { kind: 'changed' },
    })
    expect(calls(w, 'readResource')).toEqual([])
    expect(calls(w, 'getSkill')).toHaveLength(1)
  })

  it('a skill the peer no longer has, by an error answer, is taken out', async () => {
    const { mcp } = skillWorld([
      ...LISTED,
      text('references/tone.md', 'changed!!\n'),
      {
        getSkill: {
          kind: 'error-answer',
          code: -32602,
          message: 'unknown skill',
          data: null,
        } as never,
      },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('references/tone.md'))).toEqual({
      failure: { kind: 'changed' },
    })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({ ok: { skills: [] } })
  })

  it('answers not-text for a listed file whose bytes are not UTF-8', async () => {
    const bytes = String.fromCharCode(0xff, 0xfe, 0x00)
    const binary = {
      uri: `${ROOT}/logo.bin`,
      digest: `sha256:${createHash('sha256')
        .update(Buffer.from([0xff, 0xfe, 0x00]))
        .digest('hex')}`,
      size: 3,
    }
    const { mcp } = skillWorld([
      { discover: offering },
      { listActions: page(['read']) },
      { listSkills: { skills: [entryOf({ resources: [listed('SKILL.md', SKILL_MD), binary] })] } },
      { readResource: { uri: `${ROOT}/logo.bin`, blob: btoa(bytes) } },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('logo.bin'))).toEqual({
      failure: { kind: 'not-text' },
    })
  })

  it('a skill that is not listed, or one asked by someone the endpoint is not for, is not found', async () => {
    const { mcp } = skillWorld(LISTED)
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, { ...read('SKILL.md'), skill: 'other' })).toEqual({
      failure: { kind: 'skill-not-found' },
    })
    expect(await mcp.skills.read(mallory, desk, read('SKILL.md'))).toMatchObject({
      failure: { kind: 'not-available-to-you' },
    })
  })
})

describe('the memory of checked files', () => {
  const fileOf = (digest: string, bytes: number) => ({
    uri: `${ROOT}/${digest}`,
    path: digest,
    digest: digest.repeat(64).slice(0, 64),
    size: bytes,
  })

  it('keeps files by digest up to its limit, dropping the least recently read first, and never one larger than the limit', () => {
    const cache = createSkillFileCache(10)
    const a = fileOf('a', 4)
    const b = fileOf('b', 4)
    const c = fileOf('c', 4)
    cache.put(a, new Uint8Array(4))
    cache.put(b, new Uint8Array(4))
    expect(cache.get(a)).toBeDefined()
    cache.put(c, new Uint8Array(4))
    expect([cache.get(a), cache.get(b), cache.get(c)].map(hit => hit !== undefined)).toEqual([
      true,
      false,
      true,
    ])
    cache.put(fileOf('d', 11), new Uint8Array(11))
    expect(cache.get(fileOf('d', 11))).toBeUndefined()
  })
})

describe('the catalog of peer skills through changes (C403)', () => {
  it('records when it was taken, and that the peer no longer offers skills once it stops', async () => {
    const { mcp } = skillWorld([
      ...LISTED,
      { discover: peerIdentityOf() },
      { listActions: page(['read']) },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
      ok: { kind: 'acquired', freshness: { acquiredAt: '2026-11-03T12:00:00.000Z' } },
    })
    await mcp.connections.release(alice, desk)
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({ ok: { kind: 'not-declared' } })
  })

  it('a listing longer than the page limit is not taken', async () => {
    const pages = Array.from({ length: 3 }, (_, at) => ({
      listSkills: { skills: [named(`s${String(at)}`)], nextCursor: `p${String(at + 1)}` },
    }))
    const { mcp } = skillWorld([{ discover: offering }, { listActions: page(['read']) }, ...pages])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.skills(alice, desk)).toEqual({ ok: { kind: 'not-acquired' } })
  })

  it('without a store of skills, none is taken and none is found; a store that cannot be read answers unknown', async () => {
    const w = world({ script: LISTED.slice(0, 2) })
    const bare = createMcp(w.ports, w.config)
    adoptHttp(w, desk, { auth: 'none' })
    await bare.discovery.refresh(alice, { ref: desk })
    expect(await bare.discovery.skills(alice, desk)).toEqual({ ok: { kind: 'not-acquired' } })
    expect(await bare.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      failure: { kind: 'skill-not-found' },
    })
    const { mcp, skillStore } = skillWorld(LISTED)
    await mcp.discovery.refresh(alice, { ref: desk })
    skillStore.setUnavailable(true)
    expect(await mcp.discovery.skills(alice, desk)).toEqual({ failure: { kind: 'unknown' } })
    expect(await mcp.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      failure: { kind: 'unknown' },
    })
  })
})

describe('the entry a peer gives when asked again (C402)', () => {
  const twoSkills: Step = { listSkills: { skills: [entryOf(), named('notes')] } }
  const withTwo: readonly Step[] = [
    { discover: offering },
    { listActions: page(['read']) },
    twoSkills,
  ]
  const broken = text('references/tone.md', 'changed!!\n')
  const readTone = read('references/tone.md')

  it('keeps the other skills, and drops the one when the peer gives another skill under its address', async () => {
    const { mcp } = skillWorld([...withTwo, broken, { getSkill: named('other') }])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, readTone)).toEqual({ failure: { kind: 'changed' } })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
      ok: { revision: 2, skills: [{ name: 'notes' }] },
    })
  })

  it('records why when the peer now gives a skill it would not take', async () => {
    const dynamic = entryOf({ resources: 'dynamic' })
    const { mcp } = skillWorld([...withTwo, broken, { getSkill: dynamic }])
    await mcp.discovery.refresh(alice, { ref: desk })
    await mcp.skills.read(alice, desk, readTone)
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
      ok: { skills: [{ name: 'notes' }], refused: [{ name: 'style', reason: 'dynamic' }] },
    })
  })

  it('keeps the kept entry when the peer does not answer', async () => {
    const { mcp } = skillWorld([
      ...withTwo,
      broken,
      { getSkill: { kind: 'no-answer', cause: 'abandoned' } },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, readTone)).toEqual({ failure: { kind: 'changed' } })
    expect(await mcp.discovery.skills(alice, desk)).toMatchObject({
      ok: { revision: 1, skills: [{ name: 'style' }, { name: 'notes' }] },
    })
  })
})

describe('the checks of a fetched file (C402)', () => {
  const skillMd = (front: string, body = '# Style\n') => `---\n${front}\n---\n${body}`
  const check = async (fileText: string, front: Record<string, unknown>) => {
    const { mcp } = skillWorld([
      { discover: offering },
      { listActions: page(['read']) },
      {
        listSkills: {
          skills: [entryOf({ frontmatter: front, resources: [listed('SKILL.md', fileText)] })],
        },
      },
      text('SKILL.md', fileText),
      { getSkill: entryOf() },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    const answer = await mcp.skills.read(alice, desk, read('SKILL.md'))
    return 'ok' in answer ? 'given' : answer.failure.kind
  }
  const front = { name: 'style', description: 'House style.' }

  it('takes a frontmatter after a byte order mark and with CRLF lines, with lists and nested values equal to the entry', async () => {
    const withLists = { ...front, 'allowed-tools': ['Bash', 'Read'], metadata: { version: 2 } }
    const yaml =
      'name: style\r\ndescription: House style.\r\nallowed-tools:\r\n  - Bash\r\n  - Read\r\nmetadata:\r\n  version: 2'
    expect(await check(`﻿---\r\n${yaml}\r\n---\r\n# Style\r\n`, withLists)).toBe('given')
  })

  it.each([
    [
      'a list in another order',
      'allowed-tools: [Read, Bash]',
      { 'allowed-tools': ['Bash', 'Read'] },
    ],
    ['a shorter list', 'allowed-tools: [Bash]', { 'allowed-tools': ['Bash', 'Read'] }],
    ['a field the entry lacks', 'license: MIT', {}],
    ['a field it lacks', '', { license: 'MIT' }],
    ['a number for a text', 'version: 2', { version: '2' }],
  ])('answers changed for %s', async (_, extra, entryExtra) => {
    const fileText = skillMd(
      `name: style\ndescription: House style.${extra === '' ? '' : `\n${extra}`}`,
    )
    expect(await check(fileText, { ...front, ...entryExtra })).toBe('changed')
  })

  it.each([
    ['no frontmatter', '# Style\n'],
    ['no closing line', '---\nname: style\ndescription: House style.\n# Style\n'],
    [
      'text right after the closing line',
      '---\nname: style\ndescription: House style.\n---# Style\n',
    ],
    ['a frontmatter that is not YAML', '---\nname: [style\n---\n'],
  ])('answers changed for a SKILL.md with %s', async (_, fileText) => {
    expect(await check(fileText, front)).toBe('changed')
  })

  it('answers changed for a SKILL.md whose bytes are not UTF-8, and gives a listed file read by its whole address', async () => {
    const bad = Buffer.from([0xff, 0xfe])
    const binary = {
      uri: `${ROOT}/SKILL.md`,
      digest: `sha256:${createHash('sha256').update(bad).digest('hex')}`,
      size: 2,
    }
    const { mcp } = skillWorld([
      { discover: offering },
      { listActions: page(['read']) },
      {
        listSkills: {
          skills: [entryOf({ resources: [binary, listed('references/tone.md', TONE)] })],
        },
      },
      { readResource: { uri: `${ROOT}/SKILL.md`, blob: btoa(String.fromCharCode(0xff, 0xfe)) } },
      { getSkill: entryOf() },
      text('references/tone.md', TONE),
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.skills.read(alice, desk, read('SKILL.md'))).toEqual({
      failure: { kind: 'changed' },
    })
    expect(await mcp.skills.read(alice, desk, read(`${ROOT}/references/tone.md`))).toEqual({
      ok: { text: TONE, start: 0, total: size(TONE) },
    })
  })
})

describe('a range of a checked file', () => {
  const bytes = new TextEncoder().encode('ab短c')
  const at = (start: number, length: number) => sliceText(bytes, { start, length })

  it.each([
    [0, 6, 'ab短c', 0],
    [0, 2, 'ab', 0],
    [0, 3, 'ab', 0],
    [2, 1, '短', 2],
    [3, 2, 'c', 5],
    [5, 1, 'c', 5],
    [6, 4, '', 6],
    [9, 4, '', 6],
    [1, 0, 'b', 1],
  ])('from %i for %i bytes gives %j from %i', (start, length, expected, from) => {
    expect(at(start, length)).toEqual({ ok: { text: expected, start: from, total: 6 } })
  })

  it('keeps a file of exactly the limit, and two whose bytes make up the limit together', () => {
    const one = createSkillFileCache(8)
    const file = (digest: string, bytes: number) => ({
      uri: digest,
      path: digest,
      digest,
      size: bytes,
    })
    one.put(file('x', 8), new Uint8Array(8))
    expect(one.get(file('x', 8))).toBeDefined()
    const two = createSkillFileCache(8)
    two.put(file('a', 4), new Uint8Array(4))
    two.put(file('b', 4), new Uint8Array(4))
    expect([two.get(file('a', 4)), two.get(file('b', 4))].every(hit => hit !== undefined)).toBe(
      true,
    )
  })
})
