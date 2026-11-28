import { describe, expect, it } from 'vitest'
import {
  SKILL_BYTE_LIMIT,
  declaresSkills,
  judgeSkills,
  readResourceContent,
  readSkillEntry,
  requestClassOf,
} from '@omne-harness/mcp-contract'
import { json } from './json.ts'

const DIGEST = `sha256:${'a'.repeat(64)}`
const ROOT = 'skill://docs/style'

const file = (path: string, size = 10) => ({ uri: `${ROOT}/${path}`, digest: DIGEST, size })

const entryOf = (overrides: Record<string, unknown> = {}, name = 'style') =>
  json({
    uri: `${ROOT}/SKILL.md`,
    frontmatter: { name, description: 'House style.', 'allowed-tools': 'Bash' },
    resources: [file('SKILL.md'), file('references/tone.md')],
    ...overrides,
  })

describe('reading a listed skill (C403)', () => {
  it('takes the name, the description as the peer wrote it, the frontmatter verbatim and each file with its path inside the skill', () => {
    const read = readSkillEntry(entryOf())
    expect(read).toEqual({
      ok: {
        name: 'style',
        description: { untrusted: 'House style.' },
        uri: `${ROOT}/SKILL.md`,
        frontmatter: json({ name: 'style', description: 'House style.', 'allowed-tools': 'Bash' }),
        files: [
          { uri: `${ROOT}/SKILL.md`, path: 'SKILL.md', digest: DIGEST, size: 10 },
          {
            uri: `${ROOT}/references/tone.md`,
            path: 'references/tone.md',
            digest: DIGEST,
            size: 10,
          },
        ],
      },
    })
  })

  it('names a file outside the skill by its whole address', () => {
    const outside = { uri: 'skill://shared/logo.txt', digest: DIGEST, size: 3 }
    const read = readSkillEntry(entryOf({ resources: [file('SKILL.md'), outside] }))
    expect('ok' in read && read.ok.files[1]?.path).toBe('skill://shared/logo.txt')
  })

  it('does not take a dynamic skill', () => {
    expect(readSkillEntry(entryOf({ resources: 'dynamic' }))).toEqual({
      refused: { name: 'style', uri: `${ROOT}/SKILL.md`, reason: 'dynamic' },
    })
  })

  it('does not take a skill of more than 512 files or more than 16 MiB', () => {
    const many = Array.from({ length: 512 }, (_, at) => file(`f${String(at)}.md`, 1))
    expect(readSkillEntry(entryOf({ resources: [file('SKILL.md'), ...many] }))).toMatchObject({
      refused: { reason: 'too-large' },
    })
    expect(
      readSkillEntry(entryOf({ resources: [file('SKILL.md'), ...many.slice(1)] })),
    ).toHaveProperty('ok')
    const big = [file('SKILL.md', 10), file('data.bin', SKILL_BYTE_LIMIT - 9)]
    expect(readSkillEntry(entryOf({ resources: big }))).toMatchObject({
      refused: { reason: 'too-large' },
    })
    expect(
      readSkillEntry(
        entryOf({ resources: [file('SKILL.md', 10), file('data.bin', SKILL_BYTE_LIMIT - 10)] }),
      ),
    ).toHaveProperty('ok')
  })

  it.each([
    ['no frontmatter', { frontmatter: undefined }],
    ['no description', { frontmatter: { name: 'style' } }],
    ['a name that is not a Skill name', { frontmatter: { name: 'House Style', description: 'x' } }],
    ['an address that is not a SKILL.md', { uri: `${ROOT}/README.md` }],
    ['no resources', { resources: undefined }],
    ['a file without a digest', { resources: [file('SKILL.md'), { uri: `${ROOT}/a`, size: 1 }] }],
    [
      'a digest without its sha256: label',
      { resources: [file('SKILL.md'), { uri: `${ROOT}/a`, digest: 'a'.repeat(64), size: 1 }] },
    ],
    [
      'a negative size',
      { resources: [file('SKILL.md'), { uri: `${ROOT}/a`, digest: DIGEST, size: -1 }] },
    ],
    ['one address twice', { resources: [file('SKILL.md'), file('a.md'), file('a.md')] }],
    ['a SKILL.md it does not list', { resources: [file('a.md')] }],
  ])('does not take an entry with %s', (_, overrides) => {
    expect(readSkillEntry(entryOf(overrides))).toMatchObject({ refused: { reason: 'malformed' } })
  })
})

describe('judging one listing (C403)', () => {
  it('refuses both skills of one name, and takes the others', () => {
    const judged = judgeSkills([
      entryOf(),
      entryOf({
        uri: 'skill://other/style/SKILL.md',
        resources: [{ uri: 'skill://other/style/SKILL.md', digest: DIGEST, size: 1 }],
      }),
      entryOf(
        {
          uri: 'skill://docs/tone/SKILL.md',
          resources: [{ uri: 'skill://docs/tone/SKILL.md', digest: DIGEST, size: 1 }],
        },
        'tone',
      ),
      entryOf({ resources: 'dynamic' }, 'live'),
    ])
    expect(judged.skills.map(skill => skill.name)).toEqual(['tone'])
    expect(judged.refused).toEqual([
      { name: 'style', uri: `${ROOT}/SKILL.md`, reason: 'same-name' },
      { name: 'style', uri: 'skill://other/style/SKILL.md', reason: 'same-name' },
      { name: 'live', uri: `${ROOT}/SKILL.md`, reason: 'dynamic' },
    ])
  })
})

describe('whether a peer offers skills', () => {
  it('needs resources and the extension, on the 2026-07-28 revision or later', () => {
    const at = (protocolVersion: string, capabilities: unknown) =>
      declaresSkills({
        protocolVersion: protocolVersion as never,
        capabilities: json(capabilities),
      })
    const both = { resources: {}, extensions: { 'io.modelcontextprotocol/skills': {} } }
    expect(at('2026-07-28', both)).toBe(true)
    expect(at('2025-11-25', both)).toBe(false)
    expect(at('2026-07-28', { extensions: { 'io.modelcontextprotocol/skills': {} } })).toBe(false)
    expect(at('2026-07-28', { resources: {} })).toBe(false)
  })
})

describe('reading a resource', () => {
  it('gives the text or the bytes of the asked address only', () => {
    const answer = json({
      contents: [
        { uri: 'skill://x/other', text: 'no' },
        { uri: 'skill://x/a', mimeType: 'text/markdown', text: '# A' },
      ],
    })
    expect(readResourceContent(answer, 'skill://x/a')).toEqual({
      ok: { uri: 'skill://x/a', mimeType: 'text/markdown', text: '# A' },
    })
    expect(
      readResourceContent(
        json({ contents: [{ uri: 'skill://x/b', blob: 'AQI=' }] }),
        'skill://x/b',
      ),
    ).toEqual({
      ok: { uri: 'skill://x/b', blob: 'AQI=' },
    })
    expect(readResourceContent(answer, 'skill://x/c')).toEqual({ failure: 'content-missing' })
    expect(
      readResourceContent(json({ contents: [{ uri: 'skill://x/a' }] }), 'skill://x/a'),
    ).toEqual({
      failure: 'content-missing',
    })
  })

  it('is a read: sent again on a broken stream as a listing is', () => {
    for (const method of ['skills/list', 'skills/get', 'resources/read'] as const)
      expect(requestClassOf(method, false)).toBe('tools/list')
  })
})
