import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readBodyText, type JsonValue } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import {
  computeDigest,
  inferMediaType,
  isControlFile,
  parseSkillPackage,
  projectAssetBody,
  skillBodyContract,
  toAssetVersion,
  toPackageDigest,
  toPackagePath,
  toSafeReason,
  toSkillName,
} from '@omne-harness/skill-contract'
import { buildFixture, path } from './package-builder.ts'

describe('toSkillName follows the official name lexicon', () => {
  it.each([
    ['a', 'one character'],
    ['pdf-processing', 'words joined by single hyphens'],
    ['a1-b2-c3', 'digits inside words'],
    ['123', 'digits only'],
    ['a'.repeat(64), '64 characters'],
  ])('accepts %s (%s)', raw => {
    expect(toSkillName(raw)).toEqual({ ok: raw })
  })

  it.each([
    ['', 'empty'],
    ['a'.repeat(65), '65 characters'],
    ['PDF-processing', 'an uppercase letter'],
    ['-pdf', 'a leading hyphen'],
    ['pdf-', 'a trailing hyphen'],
    ['pdf--processing', 'consecutive hyphens'],
    ['pdf_processing', 'an underscore'],
    ['pdf processing', 'a space'],
    ['pdf.processing', 'a dot'],
    ['café', 'a letter outside a-z'],
    ['-', 'a hyphen only'],
  ])('rejects %j (%s)', raw => {
    expect(toSkillName(raw)).toEqual({ failure: 'invalid-name' })
  })
})

describe('toPackagePath keeps a normalized path inside the package', () => {
  it.each([
    ['SKILL.md', 'SKILL.md'],
    ['references/deep/guide.md', 'references/deep/guide.md'],
    ['./scripts/run.sh', 'scripts/run.sh'],
    ['a/./b', 'a/b'],
    ['.omne/skill.json', '.omne/skill.json'],
    ['..name', '..name'],
  ])('accepts %j as %j', (raw, normalized) => {
    expect(toPackagePath(raw)).toEqual({ ok: normalized })
  })

  it.each([
    ['', 'an empty path'],
    ['/etc/passwd', 'an absolute path'],
    ['../escape', 'a leading .. segment'],
    ['a/../../b', 'an inner .. segment'],
    ['a/..', 'a trailing .. segment'],
    ['a\\b', 'a backslash'],
    ['a//b', 'an empty segment'],
    ['a/', 'a trailing slash'],
    ['.', 'only a . segment'],
    ['./.', 'only . segments'],
    ['a\0b', 'a NUL character'],
    ['a\nb', 'a line feed'],
    ['a\u007fb', 'a DEL character'],
    ['a\ud800b', 'a lone surrogate'],
  ])('rejects %j (%s)', raw => {
    expect(toPackagePath(raw)).toEqual({ failure: 'bad-path' })
  })
})

describe('toSafeReason and toAssetVersion accept short printable text', () => {
  const granters = [
    ['toSafeReason', toSafeReason, 'invalid-reason'],
    ['toAssetVersion', toAssetVersion, 'invalid-asset-version'],
  ] as const

  describe.each(granters)('%s', (_name, grant, failure) => {
    it.each([
      ['x', 'one character'],
      ['Disabled by the organization.', 'a sentence'],
      ['é'.repeat(256), '256 characters outside ASCII'],
      ['😀'.repeat(256), '256 characters outside the basic plane'],
    ])('accepts %j (%s)', text => {
      expect(grant(text)).toEqual({ ok: text })
    })

    it.each([
      ['', 'empty'],
      ['x'.repeat(257), '257 characters'],
      ['line\nbreak', 'a line feed'],
      ['tab\there', 'a tab'],
      ['bell\u0007', 'a C0 control character'],
      ['del\u007f', 'DEL'],
      ['c1\u0085', 'a C1 control character'],
      ['lone\ud800', 'a lone surrogate'],
    ])('rejects %j (%s)', text => {
      expect(grant(text)).toEqual({ failure })
    })
  })
})

describe('computeDigest and toPackageDigest', () => {
  it('names the SHA-256 of the exact bytes in lowercase hexadecimal with a sha256: prefix', () => {
    const bytes = new Uint8Array([0, 1, 2, 255])
    const hex = createHash('sha256').update(bytes).digest('hex')
    expect(computeDigest(bytes)).toBe(`sha256:${hex}`)
    expect(computeDigest(new Uint8Array())).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('gives different digests for bytes that differ in one bit', () => {
    expect(computeDigest(new Uint8Array([1]))).not.toBe(computeDigest(new Uint8Array([3])))
  })

  it('accepts only the canonical digest text', () => {
    const digest = `sha256:${'a'.repeat(64)}`
    expect(toPackageDigest(digest)).toEqual({ ok: digest })
    for (const text of [
      '',
      `sha256:${'A'.repeat(64)}`,
      `sha256:${'a'.repeat(63)}`,
      `sha256:${'a'.repeat(65)}`,
      `sha512:${'a'.repeat(64)}`,
      'a'.repeat(64),
      ` sha256:${'a'.repeat(64)}`,
    ])
      expect(toPackageDigest(text)).toEqual({ failure: 'invalid-digest' })
  })
})

describe('inferMediaType', () => {
  const head = (text: string) => new TextEncoder().encode(text)
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  it.each([
    ['SKILL.md', 'text/markdown'],
    ['notes.TXT', 'text/plain'],
    ['data/config.json', 'application/json'],
    ['data/a.yaml', 'application/yaml'],
    ['data/a.yml', 'application/yaml'],
    ['scripts/run.sh', 'application/x-sh'],
    ['scripts/run.py', 'text/x-python'],
    ['scripts/run.js', 'text/javascript'],
    ['scripts/run.mjs', 'text/javascript'],
    ['scripts/run.ts', 'text/x-typescript'],
    ['a/page.html', 'text/html'],
    ['a/style.css', 'text/css'],
    ['a/table.csv', 'text/csv'],
    ['a/data.xml', 'application/xml'],
    ['a/image.svg', 'image/svg+xml'],
    ['a/image.png', 'image/png'],
    ['a/image.jpg', 'image/jpeg'],
    ['a/image.jpeg', 'image/jpeg'],
    ['a/image.gif', 'image/gif'],
    ['a/image.webp', 'image/webp'],
    ['a/doc.pdf', 'application/pdf'],
  ])('gives %s the type %s from its extension', (raw, type) => {
    expect(inferMediaType(path(raw), head('x'))).toBe(type)
  })

  it('takes the type from the extension before the content', () => {
    expect(inferMediaType(path('a/notes.txt'), png)).toBe('text/plain')
  })

  it.each([
    ['a PNG signature', png, 'image/png'],
    ['a JPEG signature', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['a GIF signature', head('GIF89a'), 'image/gif'],
    ['a PDF signature', head('%PDF-1.7'), 'application/pdf'],
    ['a WebP signature', head('RIFF\0\0\0\0WEBPVP8 '), 'image/webp'],
  ])('reads %s when the extension is unknown', (_name, bytes, type) => {
    expect(inferMediaType(path('assets/blob'), bytes)).toBe(type)
    expect(inferMediaType(path('assets/blob.bin'), bytes)).toBe(type)
  })

  it('leaves the type absent when neither the extension nor the content tells it', () => {
    expect(inferMediaType(path('LICENSE'), head('Plain words'))).toBeUndefined()
    expect(inferMediaType(path('a/b.unknown'), new Uint8Array([0, 1, 2]))).toBeUndefined()
    expect(inferMediaType(path('a/short'), new Uint8Array([0x89, 0x50]))).toBeUndefined()
    expect(inferMediaType(path('.hidden'), head('x'))).toBeUndefined()
  })
})

describe('isControlFile', () => {
  it('knows the two control files and nothing else', () => {
    expect(isControlFile(path('SKILL.md'))).toBe(true)
    expect(isControlFile(path('.omne/skill.json'))).toBe(true)
    for (const raw of ['skill.md', 'docs/SKILL.md', '.omne/other.json', '.omne/skill.json.bak'])
      expect(isControlFile(path(raw))).toBe(false)
  })
})

describe('projectAssetBody', () => {
  function definitionOf(name: string) {
    const built = buildFixture(name)
    const parsed = parseSkillPackage({ snapshot: built.snapshot, control: built.control })
    if (!('ok' in parsed)) throw new Error(JSON.stringify(parsed.failure))
    return parsed.ok
  }

  function textOf(body: JsonValue): unknown {
    return JSON.parse(writeJsonText(body))
  }

  it('projects name, description, tools, scripts, settings and the package digest', () => {
    const definition = definitionOf('full-skill')
    expect(textOf(projectAssetBody(definition))).toEqual({
      name: 'full-skill',
      description: 'Shows every interpreted field and one field that Skill keeps as it is.',
      tools: [{ category: 'tool', name: 'read_file' }],
      scripts: [
        {
          entry: 'scripts/run.sh',
          runKind: 'shell',
          facilities: ['network'],
          parameters: { type: 'object', required: ['target'] },
        },
      ],
      settings: [
        { name: 'api-endpoint', category: 'binding' },
        { name: 'tone', category: 'preference' },
      ],
      package: { digest: definition.snapshot.digest },
    })
  })

  it('projects empty declarations for a package without .omne/skill.json', () => {
    const definition = definitionOf('plain-skill')
    expect(textOf(projectAssetBody(definition))).toEqual({
      name: 'plain-skill',
      description: 'Shows the smallest legal package.',
      tools: [],
      scripts: [],
      settings: [],
      package: { digest: definition.snapshot.digest },
    })
  })

  it('gives a body that the skill category port accepts for the same capability name', () => {
    const body = projectAssetBody(definitionOf('full-skill'))
    const read = readBodyText(writeJsonText(body), {
      maxBytes: 65_536,
      maxDepth: 16,
      maxItems: 4096,
      maxMembers: 256,
      maxStringLength: 4096,
      maxNumberLength: 32,
    })
    if (read.kind !== 'ok') throw new Error(read.kind)
    const port = skillBodyContract()
    expect(port.judge(read.value, { capabilityName: 'full-skill' })).toEqual({ ok: true })
    expect(port.references(read.value)).toEqual([{ category: 'tool', name: 'read_file' }])
  })
})
