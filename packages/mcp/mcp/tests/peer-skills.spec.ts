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
import { createSkillFileCache } from '../src/internal/skill-files.ts'
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
