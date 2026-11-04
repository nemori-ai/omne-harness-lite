import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { capabilityId, readBodyText, type JsonValue } from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import {
  DESCRIPTION_LIMIT,
  computeDigest,
  inferMediaType,
  isControlFile,
  parseSkillPackage,
  projectAssetBody,
  skillBodyContract,
  isAssetVersion,
  isPackageDigest,
  isPackagePath,
  isSafeReason,
  isSkillDescription,
  isSkillName,
  sameCapability,
  toPackagePath,
} from '@omne-harness/skill-contract'
import { buildFixture, path } from './package-builder.ts'

describe('isSkillName follows the official name lexicon', () => {
  it.each([
    ['a', 'one character'],
    ['pdf-processing', 'words joined by single hyphens'],
    ['a1-b2-c3', 'digits inside words'],
    ['123', 'digits only'],
    ['a'.repeat(64), '64 characters'],
  ])('accepts %s (%s)', raw => {
    expect(isSkillName(raw)).toBe(true)
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
    expect(isSkillName(raw)).toBe(false)
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

describe('the guards refuse values that are not text', () => {
  it.each([undefined, null, 7, {}, ['a']])('refuses %j', value => {
    for (const guard of [
      isSkillName,
      isPackagePath,
      isSafeReason,
      isAssetVersion,
      isPackageDigest,
      isSkillDescription,
    ])
      expect(guard(value)).toBe(false)
  })
})

describe('isPackagePath accepts only the normalized form that toPackagePath gives', () => {
  it.each(['SKILL.md', 'a/b.md', '.omne/skill.json'])('accepts %j', raw => {
    expect(isPackagePath(raw)).toBe(true)
  })

  it.each(['./a', 'a/./b', '', '/a', 'a/../b', 'a\\b', 'a//b', 'a/'])('refuses %j', raw => {
    expect(isPackagePath(raw)).toBe(false)
  })
})

describe('the control character boundaries of the text guards', () => {
  it.each([
    ['\u001f', false],
    ['\u0020', true],
    ['\u007e', true],
    ['\u007f', false],
    ['\u009f', false],
    ['\u00a0', true],
  ])('treats %j inside a text as allowed: %s', (character, allowed) => {
    expect(isSafeReason(`a${character}b`)).toBe(allowed)
    expect(isAssetVersion(`a${character}b`)).toBe(allowed)
    expect(isPackagePath(`a${character}b`)).toBe(allowed)
  })
})

describe('isSkillDescription accepts text of 1 to DESCRIPTION_LIMIT (16384) characters', () => {
  it('has the limit that the public root exports', () => {
    expect(DESCRIPTION_LIMIT).toBe(16384)
  })

  it.each([
    ['one character', 'x'],
    ['1025 characters, more than the 1024 of the Agent Skills specification', 'x'.repeat(1025)],
    ['16384 characters', 'x'.repeat(16384)],
    ['16384 characters outside the basic plane', '😀'.repeat(16384)],
    ['a line feed: the description is not a short text', 'two\nlines'],
  ])('accepts %s', (_case, text) => {
    expect(isSkillDescription(text)).toBe(true)
  })

  it.each([
    ['an empty text', ''],
    ['16385 characters', 'x'.repeat(16385)],
    ['16385 characters outside the basic plane', '😀'.repeat(16385)],
  ])('rejects %s', (_case, text) => {
    expect(isSkillDescription(text)).toBe(false)
  })
})

describe('isSafeReason and isAssetVersion accept short printable text', () => {
  const guards = [
    ['isSafeReason', isSafeReason],
    ['isAssetVersion', isAssetVersion],
  ] as const

  describe.each(guards)('%s', (_name, guard) => {
    it.each([
      ['x', 'one character'],
      ['Disabled by the organization.', 'a sentence'],
      ['é'.repeat(256), '256 characters outside ASCII'],
      ['😀'.repeat(256), '256 characters outside the basic plane'],
    ])('accepts %j (%s)', text => {
      expect(guard(text)).toBe(true)
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
      expect(guard(text)).toBe(false)
    })
  })
})

describe('computeDigest and isPackageDigest', () => {
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
    expect(isPackageDigest(digest)).toBe(true)
    for (const text of [
      '',
      `sha256:${'A'.repeat(64)}`,
      `sha256:${'a'.repeat(63)}`,
      `sha256:${'a'.repeat(65)}`,
      `sha512:${'a'.repeat(64)}`,
      'a'.repeat(64),
      ` sha256:${'a'.repeat(64)}`,
    ])
      expect(isPackageDigest(text)).toBe(false)
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

describe('sameCapability', () => {
  function identity(category: string, name: string) {
    const id = capabilityId(category, name)
    if (!id.ok) throw new Error(`${category}:${name}`)
    return id.id
  }

  it('takes two identities with the same category and name for one, whatever the objects', () => {
    expect(sameCapability(identity('skill', 'review'), identity('skill', 'review'))).toBe(true)
  })

  it.each([
    ['the same name in another category', identity('tool', 'review')],
    ['another name in the same category', identity('skill', 'reviews')],
  ])('tells apart %s', (_case, other) => {
    expect(sameCapability(identity('skill', 'review'), other)).toBe(false)
    expect(sameCapability(other, identity('skill', 'review'))).toBe(false)
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
    expect(port.deriveDeclarations(read.value)).toEqual({
      entries: ['setting:binding:api-endpoint', 'setting:preference:tone'],
    })
  })
})
