import { describe, expect, it } from 'vitest'
import {
  digestBytes,
  judgePackageContent,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import {
  agentBodyContract,
  agentDefinitionCategoryDisplay,
  judgeAgentDefinition,
} from '@omne-harness/agent-contract'

const utf8 = new TextEncoder()

function packageOf(files: Readonly<Record<string, string | Uint8Array>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, value]) => [
      path,
      typeof value === 'string' ? utf8.encode(value) : value,
    ]),
  )
  return {
    manifest: async () => ({
      ok: {
        entries: [...bytes].map(([path, content]) => ({
          path,
          bytes: content.byteLength,
          digest: digestBytes(content),
        })),
      },
    }),
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? { failure: 'entry-not-found' } : { ok: found }
    },
  }
}

const plain = (body: JsonValue): Record<string, unknown> =>
  JSON.parse(writeJsonText(body)) as Record<string, unknown>

const judge = (files: Readonly<Record<string, string | Uint8Array>>, name = 'reviewer') =>
  judgePackageContent(agentBodyContract(), packageOf(files), name)

async function refusal(text: string, name = 'reviewer'): Promise<string> {
  const judged = await judge({ 'AGENT.md': text }, name)
  if ('ok' in judged) throw new Error('the package was accepted')
  return judged.failure.kind === 'invalid-package' ? judged.failure.reason : judged.failure.kind
}

const WHOLE = `---
name: reviewer
summary: Reviews one file and reports what it found.
references:
  - { category: tool, name: Files, resident: true }
  - { category: skill, name: review }
attributes: [model]
permissionBounds:
  - { capabilityId: Shell, enforcementKey: tool.invoke, allowedSet: [ask] }
---

You review code.

Report the problems you find, the worst first.
`

const fields = (lines: readonly string[], text = 'You review code.') =>
  `---\n${lines.join('\n')}\n---\n${text}\n`
const NAMED = ['name: reviewer', 'summary: Reviews one file.']

describe('an Agent definition written as a directory with AGENT.md', () => {
  it('reads the frontmatter and the text into the body every definition has, and no other field', async () => {
    const judged = await judge({ 'AGENT.md': fields(NAMED.concat('references: []')) })
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged.failure))
    const { manifest, ...body } = plain(judged.ok.body)
    expect(body).toEqual({
      name: 'reviewer',
      type: 'non-master',
      summary: 'Reviews one file.',
      references: [],
      attributes: [],
      instructions: [{ id: 'instructions', text: 'You review code.' }],
    })
    expect(Object.keys(manifest as object)).toEqual(['entries'])
    const definition = await judgeAgentDefinition({ category: 'AgentDefinition', ...body })
    expect(definition.kind).toBe('accepted')
  })

  it('reads the references with their residency, the attributes and the permission bounds', async () => {
    const judged = await judge({ 'AGENT.md': WHOLE })
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged.failure))
    const body = plain(judged.ok.body)
    expect(body['references']).toEqual([
      { capability: { category: 'tool', name: 'Files' }, resident: true },
      { capability: { category: 'skill', name: 'review' } },
    ])
    expect(body['attributes']).toEqual([{ item: 'model' }])
    expect(body['permissionBounds']).toEqual([
      { capabilityId: 'Shell', enforcementKey: 'tool.invoke', allowedSet: ['ask'] },
    ])
    expect(body['instructions']).toEqual([
      {
        id: 'instructions',
        text: 'You review code.\n\nReport the problems you find, the worst first.',
      },
    ])
    expect(agentBodyContract().references(judged.ok.body)).toEqual([
      { category: 'tool', name: 'Files' },
      { category: 'skill', name: 'review' },
    ])
  })

  it('keeps a definition with no text after the frontmatter, without instructions', async () => {
    const judged = await judge({ 'AGENT.md': fields(NAMED, '') })
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged.failure))
    expect(plain(judged.ok.body)).not.toHaveProperty('instructions')
  })

  it('refuses a master, and says a definition made here is non-master', async () => {
    expect(await refusal(fields(NAMED.concat('type: master')))).toBe(
      'AGENT.md: type is master; a definition made here is non-master: leave type out',
    )
    expect(await refusal(fields(NAMED.concat('type: helper')))).toBe(
      'AGENT.md: type is "helper"; leave type out, or write non-master',
    )
  })

  it('keeps a definition that writes type non-master, as one that leaves type out', async () => {
    const written = await judge({ 'AGENT.md': fields(NAMED.concat('type: non-master')) })
    const left = await judge({ 'AGENT.md': fields(NAMED) })
    expect('ok' in written && 'ok' in left).toBe(true)
    if (!('ok' in written) || !('ok' in left)) return
    const { manifest: _written, ...said } = plain(written.ok.body)
    const { manifest: _left, ...kept } = plain(left.ok.body)
    expect(said).toEqual(kept)
    expect(said['type']).toBe('non-master')
  })

  it('does not read a file the source cannot give, or one whose bytes are not the ones listed', async () => {
    const whole = packageOf({ 'AGENT.md': fields(NAMED) })
    const failureOf = async (reader: PackageReader) => {
      const judged = await judgePackageContent(agentBodyContract(), reader, 'reviewer')
      return 'ok' in judged ? 'accepted' : JSON.stringify(judged.failure)
    }
    expect(
      await failureOf({ ...whole, manifest: async () => ({ failure: 'unavailable' }) }),
    ).toContain('unavailable')
    expect(
      await failureOf({ ...whole, open: async () => ({ failure: 'entry-not-found' }) }),
    ).toContain('entry-not-found')
    const other = utf8.encode(fields(NAMED.concat('type: master')))
    expect(await failureOf({ ...whole, open: async () => ({ ok: other }) })).toContain(
      'material-unavailable',
    )
  })

  it('refuses a name that is not the name it is published under', async () => {
    expect(await refusal(fields(NAMED), 'auditor')).toBe('name-mismatch')
  })

  it('refuses a field it does not read, and names the fields it reads', async () => {
    expect(await refusal(fields(NAMED.concat('model: fast')))).toBe(
      'AGENT.md: the frontmatter has the field "model", which is not read; the fields are name, summary, type, references, attributes, permissionBounds',
    )
  })

  it.each([
    [
      'no frontmatter',
      'You review code.\n',
      'AGENT.md has no frontmatter: it starts with a line of three dashes, then the fields, then a line of three dashes',
    ],
    [
      'a frontmatter that is not YAML',
      '---\nname: [\n---\n',
      'AGENT.md: the frontmatter is not valid YAML',
    ],
    [
      'a frontmatter that is a list',
      '---\n- name\n---\n',
      'AGENT.md: the frontmatter is not a mapping of fields',
    ],
    ['no name', fields(['summary: Reviews.']), 'AGENT.md: name is missing or is not text'],
    ['no summary', fields(['name: reviewer']), 'AGENT.md: summary is missing or is not text'],
    [
      'references that are not a list',
      fields(NAMED.concat('references: Files')),
      'AGENT.md: references is not a list',
    ],
    [
      'a reference without a name',
      fields(NAMED.concat('references: [{ category: tool }]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a reference with another field',
      fields(NAMED.concat('references: [{ category: tool, name: Files, always: true }]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a reference that is a name alone',
      fields(NAMED.concat('references: [Files]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a reference that is a list',
      fields(NAMED.concat('references: [[tool, Files]]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a reference whose category is not text',
      fields(NAMED.concat('references: [{ category: 1, name: Files }]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a reference whose residency is not true or false',
      fields(NAMED.concat('references: [{ category: tool, name: Files, resident: always }]')),
      'AGENT.md: references[0] is not {category, name, resident?} with category and name as text and resident as true or false',
    ],
    [
      'a frontmatter that is one line of text',
      '---\njust text\n---\n',
      'AGENT.md: the frontmatter is not a mapping of fields',
    ],
    [
      'attributes that are not names',
      fields(NAMED.concat('attributes: [{ item: model }]')),
      'AGENT.md: attributes is not a list of names',
    ],
    [
      'a variable reference in the text',
      fields(NAMED, 'Say {{name}}.'),
      'AGENT.md: the text after the frontmatter contains "{{", which the prompt renderer reads as a variable reference',
    ],
  ])('refuses %s', async (_label, text, reason) => {
    expect(await refusal(text)).toBe(reason)
  })

  it('refuses text after the frontmatter that is longer than one section of instructions', async () => {
    expect(await refusal(fields(NAMED, 'x'.repeat(10_001)))).toBe(
      'AGENT.md: the text after the frontmatter is 10001 UTF-8 bytes, more than 10000',
    )
  })

  it('refuses a directory without AGENT.md, one with another file, and bytes that are not UTF-8', async () => {
    const reasonOf = async (files: Readonly<Record<string, string | Uint8Array>>) => {
      const judged = await judge(files)
      return 'ok' in judged ? 'accepted' : JSON.stringify(judged.failure)
    }
    expect(await reasonOf({ 'README.md': 'x' })).toContain(
      'the directory has no AGENT.md at its root',
    )
    expect(await reasonOf({ 'AGENT.md': fields(NAMED), 'notes/a.md': 'x' })).toContain(
      'a definition is the one file AGENT.md; the directory also has notes/a.md',
    )
    expect(
      await reasonOf({ 'AGENT.md': new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff]) }),
    ).toContain('AGENT.md is not UTF-8')
  })

  it('refuses what the body of every definition refuses: a reference named twice, an attribute it does not know', async () => {
    const twice = 'references: [{ category: tool, name: Files }, { category: tool, name: Files }]'
    expect(await refusal(fields(NAMED.concat(twice)))).toBe('duplicate-capability')
    expect(await refusal(fields(NAMED.concat('attributes: [speed]')))).toBe('unknown-attribute')
  })

  it('says how one is written with an example that is read as it stands', async () => {
    const lines = (agentDefinitionCategoryDisplay.authoring ?? '').split('\n')
    const opening = lines.indexOf('---')
    const closing = lines.indexOf('---', opening + 1)
    expect(opening).toBeGreaterThan(-1)
    expect(closing).toBeGreaterThan(opening)
    const example = `${lines.slice(opening, closing + 2).join('\n')}\n`
    const name = /^name: (.+)$/mu.exec(example)?.[1] ?? ''
    const judged = await judge({ 'AGENT.md': example }, name)
    expect('ok' in judged ? 'accepted' : judged.failure).toBe('accepted')
  })
})
