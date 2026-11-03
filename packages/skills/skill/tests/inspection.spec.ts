// `createPackageInspection`: a legal package gives its definition; every source answer maps as
// the SPEC "检查 Skill 包" and the group page "检查与发现" say. The memory source gives the legal
// cases; a stub source gives each failure at `snapshot` and at `open`.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createPackageInspection } from '@omne-harness/skill'
import { isSkillName, type InspectFailure } from '@omne-harness/skill-contract'
import type {
  PackageLocator,
  SkillPackageSource,
  SourceFailure,
} from '@omne-harness/skill-contract/provider'
import { createMemorySource } from '@omne-harness/skill-contract/testing'

const locator: PackageLocator = { kind: 'directory', root: '/skills/demo' }
const manifest = '---\nname: demo\ndescription: A demo.\n---\nBody.\n'
const declaration = JSON.stringify({
  formatVersion: 1,
  dependencies: [{ category: 'tool', name: 'read_file' }],
  settings: [{ name: 'tone', category: 'preference' }],
})

function demoSource(files: Readonly<Record<string, string>>): SkillPackageSource {
  return createMemorySource([{ locator, rootName: 'demo', files }])
}

const encoder = new TextEncoder()

function skillName(raw: string) {
  if (!isSkillName(raw)) throw new Error(raw)
  return raw
}

describe('a legal package', () => {
  it('gives the manifest, the declaration and the snapshot of a package with both control files', async () => {
    const inspection = createPackageInspection(
      demoSource({ 'SKILL.md': manifest, '.omne/skill.json': declaration, 'docs/a.md': 'A' }),
    )
    const result = await inspection.inspect(locator)
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest.name).toBe('demo')
    expect(result.ok.manifest.description).toBe('A demo.')
    expect(result.ok.declaration.dependencies).toEqual([{ category: 'tool', name: 'read_file' }])
    expect(result.ok.declaration.settings).toEqual([{ name: 'tone', category: 'preference' }])
    expect(result.ok.snapshot.entries.map(entry => entry.path)).toEqual([
      '.omne/skill.json',
      'SKILL.md',
      'docs/a.md',
    ])
  })

  it('gives empty declarations for a package without .omne/skill.json', async () => {
    const inspection = createPackageInspection(demoSource({ 'SKILL.md': manifest }))
    const result = await inspection.inspect(locator)
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.declaration).toEqual({ dependencies: [], scripts: [], settings: [] })
  })

  it('passes the expected name to the package rules', async () => {
    const inspection = createPackageInspection(demoSource({ 'SKILL.md': manifest }))
    expect(await inspection.inspect(locator, { expectedName: skillName('demo') })).toHaveProperty(
      'ok',
    )
    expect(await inspection.inspect(locator, { expectedName: skillName('other') })).toMatchObject({
      failure: { kind: 'rejected', code: 'name-mismatch' },
    })
  })

  it('opens only the control files, with the digest of the snapshot', async () => {
    const memory = demoSource({
      'SKILL.md': manifest,
      '.omne/skill.json': declaration,
      'docs/a.md': 'A',
    })
    const opened: string[] = []
    const source: SkillPackageSource = {
      snapshot: target => memory.snapshot(target),
      open: async (target, digest, path) => {
        opened.push(`${digest}:${path}`)
        return memory.open(target, digest, path)
      },
    }
    const snapshot = await memory.snapshot(locator)
    if (!('ok' in snapshot)) throw new Error(snapshot.failure)
    expect(await createPackageInspection(source).inspect(locator)).toHaveProperty('ok')
    expect(opened.sort()).toEqual([
      `${snapshot.ok.digest}:.omne/skill.json`,
      `${snapshot.ok.digest}:SKILL.md`,
    ])
  })

  it('does not open .omne/skill.json when the snapshot has none', async () => {
    const memory = demoSource({ 'SKILL.md': manifest })
    const opened: string[] = []
    const source: SkillPackageSource = {
      snapshot: target => memory.snapshot(target),
      open: async (target, digest, path) => {
        opened.push(path)
        return memory.open(target, digest, path)
      },
    }
    expect(await createPackageInspection(source).inspect(locator)).toHaveProperty('ok')
    expect(opened).toEqual(['SKILL.md'])
  })
})

/** What `inspect` answers for each source failure, at `snapshot` and at `open` alike. */
const MAPPED: readonly (readonly [SourceFailure, InspectFailure])[] = [
  ['package-not-found', { kind: 'source-unavailable' }],
  ['entry-not-found', { kind: 'source-unavailable' }],
  ['unavailable', { kind: 'source-unavailable' }],
  ['bytes-mismatch', { kind: 'version-changed' }],
  ['entry-unreadable', { kind: 'rejected', code: 'malformed' }],
  ['outside-package', { kind: 'rejected', code: 'outside-package' }],
]

/** Whether `answer` is `expected`, ignoring the free-text `detail` of a rejection. */
function sameFailure(answer: InspectFailure, expected: InspectFailure): boolean {
  if (answer.kind === 'rejected' && expected.kind === 'rejected')
    return answer.code === expected.code
  return answer.kind === expected.kind
}

async function failureOf(source: SkillPackageSource): Promise<InspectFailure> {
  const result = await createPackageInspection(source).inspect(locator)
  if ('ok' in result) throw new Error('expected a failure')
  return result.failure
}

describe('the source fails at snapshot', () => {
  it.each(MAPPED)('%s maps to %j', async (failure, expected) => {
    const source: SkillPackageSource = {
      snapshot: async () => fail(failure),
      open: async () => {
        throw new Error('open must not be called after a failed snapshot')
      },
    }
    const answer = await failureOf(source)
    expect(sameFailure(answer, expected), JSON.stringify(answer)).toBe(true)
  })
})

describe('the source fails at open', () => {
  it.each(MAPPED)('%s maps to %j', async (failure, expected) => {
    const memory = demoSource({ 'SKILL.md': manifest, '.omne/skill.json': declaration })
    const source: SkillPackageSource = {
      snapshot: target => memory.snapshot(target),
      open: async () => fail(failure),
    }
    const answer = await failureOf(source)
    expect(sameFailure(answer, expected), JSON.stringify(answer)).toBe(true)
  })

  it.each([
    ['SKILL.md', '.omne/skill.json'],
    ['.omne/skill.json', 'SKILL.md'],
  ])('answers the mapped failure when only %s fails to open', async (failing, _other) => {
    const memory = demoSource({ 'SKILL.md': manifest, '.omne/skill.json': declaration })
    const source: SkillPackageSource = {
      snapshot: target => memory.snapshot(target),
      open: async (target, digest, path) =>
        path === failing ? fail('unavailable') : memory.open(target, digest, path),
    }
    expect(await failureOf(source)).toEqual({ kind: 'source-unavailable' })
  })

  it('answers version-changed when the bytes of a control file are off the snapshot', async () => {
    const memory = demoSource({ 'SKILL.md': manifest, '.omne/skill.json': declaration })
    const source: SkillPackageSource = {
      snapshot: target => memory.snapshot(target),
      open: async (target, digest, path) =>
        path === 'SKILL.md'
          ? succeed(encoder.encode(`${manifest}changed\n`))
          : memory.open(target, digest, path),
    }
    expect(await failureOf(source)).toEqual({ kind: 'version-changed' })
  })
})
