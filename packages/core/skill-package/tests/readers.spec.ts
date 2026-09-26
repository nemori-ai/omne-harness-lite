import { describe, expect, it } from 'vitest'
import {
  readSkillMd,
  readSkillPackage,
  skillScripts,
  type SkillPackageEntry,
} from '@omne-harness-lite/skill-package'
import texts from './fixtures/text.json' with { type: 'json' }

const md =
  '---\nname: code-review\ndescription: d\n---\n\n$ARGUMENTS ${CLAUDE_SKILL_DIR} !`cmd`\r\n'
const main: SkillPackageEntry = { kind: 'file', path: 'SKILL.md', text: md }
describe('S-20 full YAML 1.2 text reader', () => {
  for (const [id, yaml, accepted] of [
    ['int and float tags differ', '{1: x, 1.0: y}', true],
    ['int and string tags differ', '{1: x, "1": y}', true],
    ['distinct unknown tags', '{!foo a: x, !bar a: y}', true],
    ['same unknown tag canonical string', '{!foo a: x, !foo "a": y}', false],
    ['implicit and explicit string same tag', '{a: x, !!str a: y}', false],
    ['integer different spellings', '{0x10: x, 16: y}', false],
    ['integer plus zero spelling', '{+00016: x, 16: y}', false],
    ['large integer adjacent keys', '{9007199254740992: x, 9007199254740993: y}', true],
    ['float different spellings', '{1.0: x, 1e0: y}', false],
    ['float giant exact duplicate', '{1e400: x, 10e399: y}', false],
    ['float giant keys differ', '{1e400: x, 2e400: y}', true],
    [
      'float long decimal keys differ',
      '{0.123456789012345678901: x, 0.123456789012345678902: y}',
      true,
    ],
    ['complex map key ordering irrelevant', '? {a: x, b: y}\n: one\n? {b: y, a: x}\n: two', false],
    ['complex tagged keys differ', '? !foo [a, b]\n: one\n? !bar [a, b]\n: two', true],
  ] as const) {
    it(`YAML node equality: ${id}`, () => {
      const result = readSkillMd(
        `---\nname: x\ndescription: d\nignored: ${yaml.startsWith('{') ? yaml : `\n  ${yaml.replace(/\n/gu, '\n  ')}`}\n---\nbody`,
      )
      if (accepted) expect(result).toHaveProperty('ok')
      else expect(result).toEqual({ rejected: 'malformed', malformed: 'M16' })
    })
  }
  for (const [id, yaml, accepted] of [
    ['unknown tag on name', 'name: !foo x\ndescription: d', false],
    ['unknown tag on allowed-tools', 'name: x\ndescription: d\nallowed-tools: !foo Read', false],
    ['unknown tag on metadata mapping', 'name: x\ndescription: d\nmetadata: !foo {a: b}', false],
    ['unknown tag on metadata scalar', 'name: x\ndescription: d\nmetadata: {a: !foo b}', false],
    [
      'unknown field retained but not constructed',
      'name: x\ndescription: d\nignored: !foo x',
      true,
    ],
    ['nonspecific tag is resolved string', 'name: ! no\ndescription: d', true],
    [
      'unknown anchor referenced by core alias',
      'ignored: &a !foo x\nname: *a\ndescription: d',
      false,
    ],
    [
      'resolved string anchor referenced by core alias',
      'ignored: &a !!str 123\nname: *a\ndescription: d',
      true,
    ],
    ['explicit integer is not string', 'name: x\ndescription: !!int 123', false],
  ] as const) {
    it(`YAML tagged core values: ${id}`, () => {
      const result = readSkillMd(`---\n${yaml}\n---\n`)
      if (accepted) expect(result).toHaveProperty('ok')
      else expect(result).toEqual({ rejected: 'malformed', malformed: 'M16' })
    })
  }
  for (const [index, row] of texts.entries()) {
    it(`examples 6 row ${index + 1}: exact read values`, () => {
      const result = readSkillMd(row.text)
      if (row.manifest === null) expect(result).toEqual({ rejected: 'malformed', malformed: 'M16' })
      else {
        expect(result).toHaveProperty('ok')
        if ('rejected' in result) throw new Error('valid text was rejected')
        expect(result.ok.manifest).toEqual(row.manifest)
        expect(result.ok.body).toBe(row.body)
        if (index === 4)
          expect(result.ok.unknownKeys).toEqual([
            { key: 'user-invocable', keySource: 'user-invocable', category: 'external_attribute' },
            { key: 'version', keySource: 'version', category: 'unknown' },
          ])
        else expect(result.ok.unknownKeys).toEqual([])
      }
    })
  }
  it('parses block scalars, flow maps, quoted values, and scalar aliases without a YAML subset', () => {
    expect(
      readSkillMd(
        '---\nname: &n no\ndescription: >-\n  first\n  second\nlicense: *n\nmetadata: {version: "1.0", note: !!str 123}\n---\n body ',
      ),
    ).toEqual({
      ok: {
        manifest: {
          name: 'no',
          description: 'first second',
          license: 'no',
          metadata: { version: '1.0', note: '123' },
        },
        body: ' body ',
        unknownKeys: [],
      },
    })
  })
  it('keeps complex/non-string unknown keys visible without coercing them into core keys', () => {
    const result = readSkillMd(
      '---\nname: x\ndescription: d\n42: arbitrary\n? [name, other]\n: {any: [shape]}\n---\n',
    )
    if ('rejected' in result) throw new Error('unknown YAML keys rejected')
    expect(result.ok.manifest).toEqual({ name: 'x', description: 'd' })
    expect(result.ok.unknownKeys).toEqual([
      { keySource: '42', category: 'unknown' },
      { keySource: '[name, other]', category: 'unknown' },
    ])
  })
  for (const [id, yaml] of [
    ['nested duplicate', 'name: x\ndescription: d\nignored: {a: x, a: y}'],
    ['decoded quoted duplicate', 'name: x\n"na\\u006de": y\ndescription: d'],
    ['complex duplicate', 'name: x\ndescription: d\n? [a, b]\n: one\n? [a, b]\n: two'],
    ['alias duplicate', '? &k name\n: x\n? *k\n: y\ndescription: d'],
    ['unresolved alias', 'name: x\ndescription: d\nignored: *missing'],
    ['nonstring metadata key', 'name: x\ndescription: d\nmetadata: {1: text}'],
    ['true core scalar', 'name: x\ndescription: true'],
    ['multiple documents', 'name: x\ndescription: d\n...\n--- ignored\n'],
  ]) {
    it(`rejects ${id}`, () => {
      expect(readSkillMd(`---\n${yaml}\n---\nbody`)).toEqual({
        rejected: 'malformed',
        malformed: 'M16',
      })
    })
  }
  it('preserves every body character and never expands placeholders or shell-shaped text', () => {
    const result = readSkillMd(md)
    if ('rejected' in result) throw new Error('valid text was rejected')
    expect(result.ok.body).toBe('\n$ARGUMENTS ${CLAUDE_SKILL_DIR} !`cmd`\r\n')
    expect(Object.isFrozen(result.ok.manifest)).toBe(true)
    expect(Object.isFrozen(result.ok.unknownKeys)).toBe(true)
  })
  for (const ending of ['---\r', '--- ', ' ---', '---\t']) {
    it(`does not accept a closing line with ${JSON.stringify(ending)}`, () => {
      expect(readSkillMd(`---\nname: x\ndescription: d\n${ending}`)).toEqual({
        rejected: 'malformed',
        malformed: 'M16',
      })
    })
  }
})
describe('S-21 supplied directory observations, normative rows 1–8', () => {
  it('row 1 drops execution mode, retains resource order, and identifies only scripts/', () => {
    const result = readSkillPackage([
      main,
      { kind: 'directory', path: 'references' },
      { kind: 'file', path: 'references/a.md' },
      { kind: 'file', path: 'scripts/run.sh', executable: true },
    ])
    if ('rejected' in result) throw new Error('valid entries rejected')
    expect(result.ok.package.resources).toEqual([
      { path: 'references/a.md' },
      { path: 'scripts/run.sh' },
    ])
    expect(skillScripts(result.ok.package)).toEqual([{ path: 'scripts/run.sh' }])
    expect(result.ok.package.body).toBe('\n$ARGUMENTS ${CLAUDE_SKILL_DIR} !`cmd`\r\n')
  })
  it('row 2 does not relax case of SKILL.md', () => {
    expect(
      readSkillPackage([
        { kind: 'file', path: 'skill.md', text: md },
        { kind: 'file', path: 'references/a.md' },
      ]),
    ).toEqual({ rejected: 'manifest_missing' })
  })
  it('row 3 consumes caller-observed outside link as resource_escapes', () => {
    expect(
      readSkillPackage([main, { kind: 'link', path: 'references/shared', resolution: 'outside' }]),
    ).toEqual({ rejected: 'resource_escapes' })
  })
  it('row 4 consumes caller-observed cycle as malformed M17', () => {
    expect(
      readSkillPackage([main, { kind: 'link', path: 'references/loop', resolution: 'cycle' }]),
    ).toEqual({ rejected: 'malformed', malformed: 'M17' })
  })
  it('row 5 sidecar remains an ordinary unparsed resource', () => {
    const result = readSkillPackage([
      main,
      { kind: 'file', path: 'agents/openai.yaml', text: 'policy: [any unresolved: yaml shape' },
    ])
    if ('rejected' in result) throw new Error('sidecar was interpreted')
    expect(result.ok.package.resources).toEqual([{ path: 'agents/openai.yaml' }])
  })
  it('row 6 reads definition only at its reserved path and never lists it as resource', () => {
    const result = readSkillPackage([
      main,
      { kind: 'file', path: '.omne/skill.json', text: '{"format":1}' },
    ])
    if ('rejected' in result) throw new Error('valid definition rejected')
    expect(result.ok.package.definition).toEqual({ format: 1 })
    expect(result.ok.package.resources).toEqual([])
  })
  for (const [id, path] of [
    [7, 'skill.json'],
    [8, '.DS_Store'],
  ] as const) {
    it(`row ${id} keeps ${path} as ordinary resource`, () => {
      const result = readSkillPackage([main, { kind: 'file', path, text: 'not json' }])
      if ('rejected' in result) throw new Error('ordinary resource rejected')
      expect(result.ok.package.resources).toEqual([{ path }])
      expect(result.ok.package.definition).toBeUndefined()
    })
  }
  it('accepts caller-resolved in-root file and consumes media type without claiming a link resolver', () => {
    const result = readSkillPackage([
      main,
      {
        kind: 'file',
        path: 'references/shared.md',
        text: 'same bytes',
        linkResolution: 'inside',
        mediaType: 'text/markdown',
      },
    ])
    if ('rejected' in result) throw new Error('resolved file rejected')
    expect(result.ok.package.resources).toEqual([
      { path: 'references/shared.md', mediaType: 'text/markdown' },
    ])
  })
  it('rejects unknown special file and unresolved link', () => {
    expect(readSkillPackage([main, { kind: 'special', path: 'socket' }])).toEqual({
      rejected: 'malformed',
      malformed: 'M17',
    })
    expect(
      readSkillPackage([main, { kind: 'link', path: 'bad', resolution: 'unresolved' }]),
    ).toEqual({ rejected: 'malformed', malformed: 'M17' })
  })
  it('uses strict JSON for definition bytes and decoded duplicate names', () => {
    for (const text of [
      '{"format":1,"for\\u006dat":1}',
      '{"format":1,}',
      '{"format":1,"settings":[{"item":"x","domain":{"schema":{"a":1,"a":2}}}]}',
    ])
      expect(readSkillPackage([main, { kind: 'file', path: '.omne/skill.json', text }])).toEqual({
        rejected: 'malformed',
      })
  })
  it('rejects duplicate or prefix-conflicting supplied resource paths', () => {
    expect(
      readSkillPackage([main, { kind: 'file', path: 'a' }, { kind: 'file', path: 'a/b' }]),
    ).toEqual({ rejected: 'malformed', malformed: 'M8' })
    expect(
      readSkillPackage([
        main,
        { kind: 'file', path: 'a', mediaType: 'text/plain' },
        { kind: 'file', path: 'a', mediaType: 'text/markdown' },
      ]),
    ).toEqual({ rejected: 'malformed', malformed: 'M8' })
  })
  it('JSON syntax failure does not outrank observed escapes or name mismatch', () => {
    const invalid: SkillPackageEntry = { kind: 'file', path: '.omne/skill.json', text: '{' }
    expect(
      readSkillPackage([main, invalid, { kind: 'link', path: 'shared', resolution: 'outside' }]),
    ).toEqual({ rejected: 'resource_escapes' })
    expect(readSkillPackage([main, invalid], { capabilityName: 'Other' })).toEqual({
      rejected: 'name_mismatch',
    })
  })
  it('preserves an exact number spelling in definition and checks its numeric value', () => {
    const result = readSkillPackage([
      main,
      { kind: 'file', path: '.omne/skill.json', text: '{"format":1.0}' },
    ])
    if ('rejected' in result) throw new Error('numeric one rejected')
    expect(result.ok.package.definition?.format).toHaveProperty('source', '1.0')
    expect(
      readSkillPackage([
        main,
        { kind: 'file', path: '.omne/skill.json', text: '{"format":1.0000000000000000000001}' },
      ]),
    ).toEqual({ rejected: 'definition_format_unsupported' })
  })
  it('keeps ordered rejection precedence across supplied observations', () => {
    const badDefinition: SkillPackageEntry = {
      kind: 'file',
      path: '.omne/skill.json',
      text: '{"format":2}',
    }
    const outside: SkillPackageEntry = { kind: 'link', path: 'shared', resolution: 'outside' }
    expect(readSkillPackage([main, badDefinition, outside], { capabilityName: 'Other' })).toEqual({
      rejected: 'name_mismatch',
    })
    expect(readSkillPackage([main, badDefinition, outside])).toEqual({
      rejected: 'definition_format_unsupported',
    })
    expect(readSkillPackage([main, outside, { kind: 'special', path: 'socket' }])).toEqual({
      rejected: 'resource_escapes',
    })
  })
})
