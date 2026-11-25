import { describe, expect, it, vi } from 'vitest'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readJsonText } from '@omne-harness/json-text'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  attachSkillsAccess,
  createSkillsAuthor,
  skillsAccessOf,
  skillsToolModule,
  type SkillsAccess,
  type SkillsFailure,
  type SkillsListing,
  type SkillsPage,
  type SkillsText,
} from '@omne-harness/tool-definitions'

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
function json(value: unknown) {
  const parsed = readJsonText(JSON.stringify(value), {
    maxBytes: 1048576,
    maxDepth: 12,
    maxItems: 128,
    maxMembers: 32,
    maxStringLength: 1048576,
    maxNumberLength: 32,
  })
  if (parsed.kind !== 'ok') throw new Error('test JSON')
  return parsed.value
}

const DIRECTORY = '/state/assets/74656e616e74/skills/weekly-report/sha256-ab'
const page: SkillsPage = {
  entries: [
    { kind: 'available', name: 'weekly-report', description: 'Write the weekly report.' },
    { kind: 'disabled', name: 'meeting-notes', reason: 'disabled by the tenant' },
  ],
  next: 'WzIsImFiIiwyXQ',
}
const body: SkillsText = {
  text: '# Weekly report\nRun scripts/collect.mjs.',
  start: 0,
  end: 39,
  total: 39,
  directory: DIRECTORY,
}
const listing: SkillsListing = {
  directory: DIRECTORY,
  files: [
    { path: 'scripts/collect.mjs', size: 120, mediaType: 'text/javascript' },
    { path: 'references/format.md', size: 64 },
  ],
}
const script: SkillsText = { text: 'console.log("collected")\n', start: 0, end: 25, total: 25 }

type Answers = Partial<{
  search: Awaited<ReturnType<SkillsAccess['search']>>
  read: Awaited<ReturnType<SkillsAccess['read']>>
  list: Awaited<ReturnType<SkillsAccess['list']>>
  readFile: Awaited<ReturnType<SkillsAccess['readFile']>>
}>
function access(answers: Answers = {}) {
  return {
    search: vi.fn(async () => answers.search ?? { ok: page }),
    read: vi.fn(async () => answers.read ?? { ok: body }),
    list: vi.fn(async () => answers.list ?? { ok: listing }),
    readFile: vi.fn(async () => answers.readFile ?? { ok: script }),
  } satisfies SkillsAccess
}
function failing(failure: SkillsFailure) {
  return access({
    search: { failure },
    read: { failure },
    list: { failure },
    readFile: { failure },
  })
}

function fixture(construction: object = { resultMaxBytes: 1048576 }) {
  const created = createSkillsAuthor(json(construction))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const implementation = created.ok
  const registration = readToolRegistration(implementation)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operations = registration.operations
  const definition = deriveDefinition(
    { asset: { name: 'Skills', adoption: skillsToolModule.executor }, requiredCapabilities: [] },
    implementation.facts,
  )
  function decode(command: string, params: unknown) {
    const operation = operations.find(([name]) => name === command)?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary')
      throw new Error('ordinary command')
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    const parsed = 'failure' in cut ? cut : operation.author.parameters.parse(cut.ok)
    return { operation: operation.author, parsed }
  }
  async function run(command: string, params: unknown, skills?: SkillsAccess) {
    const { operation, parsed } = decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = skills === undefined ? scope() : attachSkillsAccess(scope(), skills)
    const result = await executeTool(parsed.ok, operation.executor, null, execution)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    const checked = operation.output.check({ arguments: parsed.ok, value: result.ok })
    if ('failure' in checked) throw new Error(JSON.stringify(checked.failure))
    const bytes = operation.codec.encode(checked.ok)
    if ('failure' in bytes) throw new Error(JSON.stringify(bytes.failure))
    const decoded = operation.codec.decode(bytes.ok)
    if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
    const rendered = operation.renderer.render(decoded.ok)
    if ('failure' in rendered) throw new Error(JSON.stringify(rendered.failure))
    return rendered.ok
  }
  return { implementation, definition, decode, run }
}

describe('Skills author: declaration and help', () => {
  it('publishes one wrapped declaration with five read-only commands, no environment and no settings', async () => {
    const test = fixture()
    expect(judgeToolDefinition(test.definition)).toHaveProperty('ok')
    if (test.definition.kind !== 'commands') throw new Error('commands')
    expect(test.definition.encoding).toBe('wrapped')
    expect(test.definition.commands.map(item => item.name)).toEqual([
      'help',
      'search',
      'read',
      'list',
      'read_file',
    ])
    expect(test.implementation.facts.backgroundAllowed).toBe(false)
    expect(test.implementation.facts.declarations).toMatchObject({
      environment: null,
      settings: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
    })
    expect(test.implementation.facts.description).toContain('Shell')
    expect(test.implementation.facts.description).not.toContain('{"command"')
  })

  it('answers help with the menu, and help with a name with that command in full', async () => {
    const test = fixture()
    if (test.definition.kind !== 'commands') throw new Error('commands')
    const menu = await test.run('help', {})
    expect(menu).toBe(`done Skills help\n${commandGuide(test.definition)}`)
    expect(menu).toContain('\nsearch {query?, after?, limit?} - ')
    expect(menu).toContain('\nread {skill, offset?} - ')
    expect(menu).toContain('\nlist {skill} - ')
    expect(menu).toContain('\nread_file {skill, path, offset?} - ')
    const readFile = await test.run('help', { name: 'read_file' })
    expect(readFile).toBe(
      `done Skills help read_file\n${commandGuide(test.definition, 'read_file')}`,
    )
    expect(readFile).toContain(
      'Usage: Skills {"command": "read_file", "params": {skill, path, offset?}}',
    )
    expect(test.decode('help', { name: 'exec' }).parsed).toHaveProperty('failure')
  })

  it('has no command that runs anything', () => {
    const test = fixture()
    if (test.definition.kind !== 'commands') throw new Error('commands')
    for (const name of test.definition.commands.map(item => item.name))
      expect(['exec', 'execute', 'run', 'exec_script']).not.toContain(name)
  })

  it('does not change its definition with the construction values', () => {
    const small = fixture({ resultMaxBytes: 4096 })
    const large = fixture({ resultMaxBytes: 1048576 })
    expect(JSON.stringify(small.definition)).toBe(JSON.stringify(large.definition))
  })

  it('requires a positive resultMaxBytes and nothing else', () => {
    expect(createSkillsAuthor(json({}))).toMatchObject({
      failure: { field: 'construction', reason: 'missing-field:resultMaxBytes' },
    })
    expect(createSkillsAuthor(json({ resultMaxBytes: 0 }))).toMatchObject({
      failure: { field: 'construction', reason: 'invalid-field:resultMaxBytes' },
    })
    expect(createSkillsAuthor(json({ resultMaxBytes: 4096, extra: 1 }))).toMatchObject({
      failure: { field: 'construction' },
    })
  })
})

describe('Skills author: search', () => {
  it('lists names and descriptions best first, marks a disabled Skill with its reason, and gives the next cursor', async () => {
    const test = fixture()
    const skills = access()
    const text = await test.run('search', { query: '周报', limit: 2 }, skills)
    expect(skills.search).toHaveBeenCalledWith(
      { query: '周报', after: null, limit: 2 },
      expect.any(AbortSignal),
    )
    expect(text).toBe(
      [
        'done Skills search query="周报" results=2 next="WzIsImFiIiwyXQ"',
        '1. weekly-report - Write the weekly report.',
        '2. meeting-notes [disabled: disabled by the tenant]',
        '[more: Skills search with the same query and after="WzIsImFiIiwyXQ"]',
      ].join('\n'),
    )
  })

  it('passes an empty query, the default limit and no cursor when the fields are omitted', async () => {
    const test = fixture()
    const skills = access({ search: { ok: { entries: [], next: null } } })
    const text = await test.run('search', {}, skills)
    expect(skills.search).toHaveBeenCalledWith(
      { query: '', after: null, limit: 10 },
      expect.any(AbortSignal),
    )
    expect(text).toBe(
      'done Skills search query="" results=0\nno Skill matches; try other words, or an empty query to list every Skill',
    )
  })

  it('passes the cursor and reduces a limit above the maximum to the maximum', async () => {
    const test = fixture()
    const skills = access({ search: { ok: { entries: [], next: null } } })
    await test.run('search', { query: 'x', after: 'abc', limit: 1000 }, skills)
    expect(skills.search).toHaveBeenCalledWith(
      { query: 'x', after: 'abc', limit: 50 },
      expect.any(AbortSignal),
    )
  })

  it('cuts a description longer than 1024 characters and says so', async () => {
    const test = fixture()
    const long = '说'.repeat(1030)
    const skills = access({
      search: {
        ok: { entries: [{ kind: 'available', name: 'long', description: long }], next: null },
      },
    })
    const text = await test.run('search', { query: '' }, skills)
    expect(text).toContain(`1. long - ${'说'.repeat(1024)}… (read the Skill for the rest)`)
    expect(text).not.toContain('说'.repeat(1025))
  })

  it('shows a description of exactly 1024 characters whole and folds its line breaks into spaces', async () => {
    const test = fixture()
    const exact = '字'.repeat(1024)
    const skills = access({
      search: {
        ok: {
          entries: [
            { kind: 'available', name: 'exact', description: exact },
            {
              kind: 'available',
              name: 'lines',
              description: 'First line.\n\n  Second\r\nthird\nfourth',
            },
          ],
          next: null,
        },
      },
    })
    const text = await test.run('search', { query: '' }, skills)
    expect(text).toBe(
      [
        'done Skills search query="" results=2',
        `1. exact - ${exact}`,
        '2. lines - First line. Second third fourth',
      ].join('\n'),
    )
  })

  it('rejects a limit that is not a positive integer and a cursor that is not text before the port is asked', () => {
    const test = fixture()
    expect(test.decode('search', { limit: 0 }).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'invalid-field:limit' },
    })
    expect(test.decode('search', { limit: 1.5 }).parsed).toHaveProperty('failure')
    expect(test.decode('search', { after: 3 }).parsed).toHaveProperty('failure')
  })

  it('answers a cursor the port does not accept with invalid-cursor', async () => {
    const test = fixture()
    const text = await test.run('search', { after: 'stale' }, failing({ kind: 'invalid-cursor' }))
    expect(text).toBe(
      'ERROR: invalid-cursor (the cursor is not from this search or the results changed; search again without after)',
    )
  })
})

describe('Skills author: read, list and read_file', () => {
  it('reads the SKILL.md body with the local directory of the Skill', async () => {
    const test = fixture()
    const skills = access()
    const text = await test.run('read', { skill: 'weekly-report' }, skills)
    const call = skills.read.mock.calls[0] as unknown as [
      { skill: string; offset: number; maxBytes: number },
    ]
    expect(call[0]).toMatchObject({ skill: 'weekly-report', offset: 0 })
    expect(call[0].maxBytes).toBe(1048576 - 8192)
    expect(text).toBe(
      [
        'done Skills read skill=weekly-report bytes=0-39 total=39',
        `directory=${DIRECTORY}`,
        '# Weekly report\nRun scripts/collect.mjs.',
      ].join('\n'),
    )
  })

  it('says how to read on with offset when the body does not fit', async () => {
    const test = fixture({ resultMaxBytes: 4096 })
    const skills = access({
      read: {
        ok: { text: 'a'.repeat(2000), start: 100, end: 2100, total: 9000, directory: DIRECTORY },
      },
    })
    const text = await test.run('read', { skill: 'weekly-report', offset: 100 }, skills)
    const call = skills.read.mock.calls[0] as unknown as [{ offset: number; maxBytes: number }]
    expect(call[0].offset).toBe(100)
    expect(call[0].maxBytes).toBe(2048)
    expect(
      text.startsWith('done Skills read skill=weekly-report bytes=100-2100 total=9000\n'),
    ).toBe(true)
    expect(text.endsWith('\n[more: Skills read skill=weekly-report offset=2100]')).toBe(true)
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4096)
  })

  it('reads the body without a directory line when this assembly keeps no local directory', async () => {
    const test = fixture()
    const skills = access({ read: { ok: { text: 'body', start: 0, end: 4, total: 4 } } })
    expect(await test.run('read', { skill: 'weekly-report' }, skills)).toBe(
      'done Skills read skill=weekly-report bytes=0-4 total=4\nbody',
    )
  })

  it('lists the files without a directory line when this assembly keeps no local directory', async () => {
    const test = fixture()
    const skills = access({ list: { ok: { files: [{ path: 'a.md', size: 1 }] } } })
    expect(await test.run('list', { skill: 'weekly-report' }, skills)).toBe(
      'done Skills list skill=weekly-report files=1\na.md 1 bytes',
    )
  })

  it('lists the files of a Skill with sizes and the directory', async () => {
    const test = fixture()
    const skills = access()
    const text = await test.run('list', { skill: 'weekly-report' }, skills)
    expect(skills.list).toHaveBeenCalledWith({ skill: 'weekly-report' }, expect.any(AbortSignal))
    expect(text).toBe(
      [
        'done Skills list skill=weekly-report files=2',
        `directory=${DIRECTORY}`,
        'scripts/collect.mjs 120 bytes text/javascript',
        'references/format.md 64 bytes',
      ].join('\n'),
    )
  })

  it('reads one file by its path inside the Skill', async () => {
    const test = fixture()
    const skills = access()
    const text = await test.run(
      'read_file',
      { skill: 'weekly-report', path: 'scripts/collect.mjs', offset: 0 },
      skills,
    )
    const call = skills.readFile.mock.calls[0] as unknown as [
      { skill: string; path: string; offset: number; maxBytes: number },
    ]
    expect(call[0]).toMatchObject({
      skill: 'weekly-report',
      path: 'scripts/collect.mjs',
      offset: 0,
    })
    await test.run(
      'read_file',
      { skill: 'weekly-report', path: 'scripts/collect.mjs', offset: 7 },
      skills,
    )
    const later = skills.readFile.mock.calls[1] as unknown as [{ offset: number }]
    expect(later[0].offset).toBe(7)
    expect(text).toBe(
      'done Skills read_file skill=weekly-report path=scripts/collect.mjs bytes=0-25 total=25\nconsole.log("collected")\n',
    )
  })

  it('says not-text for a binary file', async () => {
    const test = fixture()
    const skills = access({ readFile: { failure: { kind: 'not-text' } } })
    expect(await test.run('read_file', { skill: 'weekly-report', path: 'logo.png' }, skills)).toBe(
      'ERROR: not-text (the file is binary; run or copy it with Shell from the Skill directory)',
    )
  })

  it('rejects a missing skill or path before the port is asked', () => {
    const test = fixture()
    expect(test.decode('read', {}).parsed).toHaveProperty('failure')
    expect(test.decode('read', { skill: '' }).parsed).toHaveProperty('failure')
    expect(test.decode('read_file', { skill: 'weekly-report' }).parsed).toHaveProperty('failure')
    expect(test.decode('read', { skill: 'weekly-report', offset: -1 }).parsed).toHaveProperty(
      'failure',
    )
  })
})

describe('Skills author: where a Skill comes from and what it needs (table 5.4)', () => {
  const source = { layer: 'tenant', version: 'sha256:9f2c' } as const

  it('R1: read, list and read_file say the layer and the version the text comes from', async () => {
    const test = fixture()
    const skills = access({
      read: { ok: { ...body, source } },
      list: { ok: { ...listing, source } },
      readFile: { ok: { ...script, source } },
    })
    expect(await test.run('read', { skill: 'weekly-report' }, skills)).toBe(
      [
        'done Skills read skill=weekly-report bytes=0-39 total=39',
        'source=tenant version=sha256:9f2c',
        `directory=${DIRECTORY}`,
        '# Weekly report\nRun scripts/collect.mjs.',
      ].join('\n'),
    )
    expect(await test.run('list', { skill: 'weekly-report' }, skills)).toContain(
      'done Skills list skill=weekly-report files=2\nsource=tenant version=sha256:9f2c\n',
    )
    expect(
      await test.run('read_file', { skill: 'weekly-report', path: 'scripts/collect.mjs' }, skills),
    ).toContain('\nsource=tenant version=sha256:9f2c\nconsole.log("collected")')
  })

  it('R2: a tool the Skill needs that this session does not have now is named, and the text is still given whole', async () => {
    const test = fixture()
    const skills = access({ read: { ok: { ...body, source, missingTools: ['Browser', 'Mail'] } } })
    expect(await test.run('read', { skill: 'weekly-report' }, skills)).toBe(
      [
        'done Skills read skill=weekly-report bytes=0-39 total=39',
        'source=tenant version=sha256:9f2c missing-tools=Browser,Mail',
        `directory=${DIRECTORY}`,
        '# Weekly report\nRun scripts/collect.mjs.',
      ].join('\n'),
    )
  })

  it('R3: when the tools of this session cannot be read, it says it does not know', async () => {
    const test = fixture()
    const skills = access({ read: { ok: { ...body, source, missingTools: 'unknown' } } })
    expect(await test.run('read', { skill: 'weekly-report' }, skills)).toContain(
      '\nsource=tenant version=sha256:9f2c missing-tools=unknown\n',
    )
  })

  it('R4, R5: a search line names what the Skill needs before its description; a disabled one says only why', async () => {
    const test = fixture()
    const skills = access({
      search: {
        ok: {
          entries: [
            {
              kind: 'available',
              name: 'weekly-report',
              description: 'Write the weekly report.',
              needs: ['Browser'],
            },
            { kind: 'disabled', name: 'meeting-notes', reason: 'disabled by the tenant' },
          ],
          next: null,
        },
      },
    })
    expect(await test.run('search', { query: 'report' }, skills)).toBe(
      [
        'done Skills search query="report" results=2',
        '1. weekly-report [needs: Browser] - Write the weekly report.',
        '2. meeting-notes [disabled: disabled by the tenant]',
      ].join('\n'),
    )
  })

  it('the guide says what source, version and the tools a Skill needs mean', async () => {
    const test = fixture()
    const help = await test.run('help', {}, access())
    expect(help).toContain('source=<layer> version=<version>')
    expect(help).toContain('missing-tools=')
    expect(help).toContain('[needs: ...]')
  })
})

describe('Skills author: failures', () => {
  const cases: readonly [SkillsFailure, string][] = [
    [{ kind: 'not-found' }, 'ERROR: not-found (no Skill with this name is available to you)'],
    [
      { kind: 'disabled', reason: 'disabled by the tenant' },
      'ERROR: disabled (disabled by the tenant)',
    ],
    [
      { kind: 'file-not-found' },
      'ERROR: file-not-found (the Skill has no file at this path; list shows its files)',
    ],
    [
      { kind: 'not-text' },
      'ERROR: not-text (the file is binary; run or copy it with Shell from the Skill directory)',
    ],
    [
      { kind: 'changed' },
      'ERROR: changed (the Skill changed while it was read; read it again from offset 0)',
    ],
    [
      { kind: 'invalid', field: 'skill', reason: 'not a Skill name' },
      'ERROR: invalid (skill: not a Skill name)',
    ],
    [
      { kind: 'invalid', field: 'path', reason: 'outside the Skill' },
      'ERROR: invalid (path: outside the Skill)',
    ],
    [
      { kind: 'invalid-cursor' },
      'ERROR: invalid-cursor (the cursor is not from this search or the results changed; search again without after)',
    ],
    [
      { kind: 'unavailable', reason: 'the Skill store cannot be read now' },
      'ERROR: unavailable (the Skill store cannot be read now)',
    ],
  ]
  it.each(cases)('renders %j as one line', async (failure, line) => {
    const test = fixture()
    expect(await test.run('read_file', { skill: 's', path: 'p' }, failing(failure))).toBe(line)
    expect(await test.run('read', { skill: 's' }, failing(failure))).toBe(line)
    expect(await test.run('list', { skill: 's' }, failing(failure))).toBe(line)
    expect(await test.run('search', { query: 'q' }, failing(failure))).toBe(line)
  })

  it('answers a name the caller may not read exactly as a name that does not exist', async () => {
    const test = fixture()
    const notFound = failing({ kind: 'not-found' })
    expect(await test.run('read', { skill: 'other-tenant-skill' }, notFound)).toBe(
      await test.run('read', { skill: 'no-such-skill' }, notFound),
    )
  })

  it('answers unavailable when no Skills access is attached to the call', async () => {
    const test = fixture()
    for (const [command, params] of [
      ['search', {}],
      ['read', { skill: 's' }],
      ['list', { skill: 's' }],
      ['read_file', { skill: 's', path: 'p' }],
    ] as const)
      expect(await test.run(command, params)).toBe(
        'ERROR: unavailable (Skills access is not attached to this call)',
      )
  })
})

describe('Skills author: output check', () => {
  it('accepts only text within resultMaxBytes', () => {
    const test = fixture({ resultMaxBytes: 4 })
    const { operation, parsed } = test.decode('list', { skill: 's' })
    if ('failure' in parsed) throw new Error('parsed')
    expect(operation.output.check({ arguments: parsed.ok, value: 'abcd' })).toHaveProperty('ok')
    expect(operation.output.check({ arguments: parsed.ok, value: 'abcde' })).toStrictEqual({
      failure: { reason: 'bounded-text-required' },
    })
    expect(operation.output.check({ arguments: parsed.ok, value: 4 })).toHaveProperty('failure')
  })
})

describe('Skills author: result codec', () => {
  it('encodes only text and decodes only well-formed UTF-8', () => {
    const test = fixture()
    const { operation } = test.decode('list', { skill: 's' })
    expect(operation.codec.encode(3)).toStrictEqual({ failure: { reason: 'text-required' } })
    expect(operation.codec.decode(new Uint8Array([0xff, 0xfe]))).toStrictEqual({
      failure: { reason: 'invalid-utf8' },
    })
    const bytes = operation.codec.encode('目录')
    if ('failure' in bytes) throw new Error('encode')
    expect(operation.codec.decode(bytes.ok)).toStrictEqual({ ok: '目录' })
  })
})

describe('attachSkillsAccess', () => {
  it('attaches the port to the call context and removes it when the call finishes', async () => {
    const skills = access()
    const attached = attachSkillsAccess(scope(), skills)
    expect(skillsAccessOf(attached.context)).toBe(skills)
    const first = attached.finish('returned')
    expect(attached.finish('failed')).toBe(first)
    await expect(first).resolves.toHaveProperty('ok')
    expect(skillsAccessOf(attached.context)).toBeUndefined()
  })
})
