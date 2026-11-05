// `read` and `list` through the public service: the body from its start, resources as text or
// bytes, the step order, the failures of the steps, no partial content on `version-changed`
// and `aborted`, the abort checkpoints before any port, and no cache between two calls.
import { describe, expect, it } from 'vitest'
import { createSkillAccess } from '@omne-harness/skill'
import { isSkillName, type ReadTarget } from '@omne-harness/skill-contract'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
} from '@omne-harness/skill-contract/testing'
import {
  alice,
  BLOB,
  BODY,
  bytesOf,
  createWorld,
  currentBasis,
  digestOf,
  granted,
  earlierBasis,
  failureOf,
  FRONT,
  GUIDE,
  large,
  LARGE_BODY,
  mallory,
  noPackage,
  okOf,
  path,
  review,
  reviewLocator,
  scope,
} from './access-world.ts'

const body: ReadTarget = { capability: review, part: { kind: 'body' } }
const resource = (raw: string): ReadTarget => ({
  capability: review,
  part: { kind: 'resource', path: raw },
})

describe('read gives', () => {
  it('the body from after the closing delimiter, with the basis of the material', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, body))
    expect(result).toStrictEqual({
      basis: currentBasis,
      part: { kind: 'body' },
      mediaType: 'text/markdown',
      content: { kind: 'text', text: BODY },
      range: { start: 0, length: bytesOf(BODY).length },
      total: bytesOf(BODY).length,
      complete: true,
    })
  })

  it('a page of the body relative to the body start', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, body, { range: { start: 0, length: 4 } }))
    expect(result.content).toStrictEqual({ kind: 'text', text: 'Read' })
    expect(result.complete).toBe(false)
  })

  it('at most one page of a body longer than a page', async () => {
    const { access } = createWorld()
    const target: ReadTarget = { capability: large, part: { kind: 'body' } }
    const first = okOf(
      await access.read(alice, scope, target, { range: { start: 0, length: 100_000 } }),
    )
    expect(first.range).toStrictEqual({ start: 0, length: 65_536 })
    expect(first.total).toBe(bytesOf(LARGE_BODY).length)
    expect(first.complete).toBe(false)
    const rest = okOf(
      await access.read(alice, scope, target, { range: { start: 65_536, length: 65_536 } }),
    )
    expect(rest.complete).toBe(true)
    expect(
      (first.content.kind === 'text' ? first.content.text : '') +
        (rest.content.kind === 'text' ? rest.content.text : ''),
    ).toBe(LARGE_BODY)
  })

  it('a text resource with its media type', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('docs/guide.md')))
    expect(result.part).toStrictEqual({ kind: 'resource', path: 'docs/guide.md' })
    expect(result.mediaType).toBe('text/markdown')
    expect(result.content).toStrictEqual({ kind: 'text', text: GUIDE })
  })

  it('a resource whole, even when its text looks like a frontmatter', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('docs/front.md')))
    expect(result.content).toStrictEqual({ kind: 'text', text: FRONT })
    expect(result.total).toBe(bytesOf(FRONT).length)
  })

  it('a binary resource as bytes without a media type', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('assets/blob.bin')))
    expect(result).not.toHaveProperty('mediaType')
    expect(result.content).toStrictEqual({ kind: 'bytes', bytes: BLOB })
    expect(result.total).toBe(BLOB.length)
  })

  it('the material that a basis names, when the source still holds it', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, body, { basis: currentBasis }))
    expect(result.basis).toStrictEqual(currentBasis)
  })
})

describe('the order of the steps', () => {
  it.each([
    '../x.md',
    '/docs/guide.md',
    'docs//guide.md',
    'docs\\guide.md',
    '',
    'SKILL.md',
    '.omne/skill.json',
  ])('step-06-bad-path for %j, before any source call', async raw => {
    const { access, controls } = createWorld()
    expect(failureOf(await access.read(alice, scope, resource(raw)))).toStrictEqual({
      kind: 'bad-path',
    })
    expect(controls.calls().snapshot).toBe(0)
  })

  it('step-06-normalizes a path with a dot segment', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('./docs/guide.md')))
    expect(result.part).toStrictEqual({ kind: 'resource', path: 'docs/guide.md' })
  })

  it('step-06-comes after the gate: a stranger with a bad path gets not-available-to-you', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.read(mallory, scope, resource('../x')))).toStrictEqual({
      kind: 'not-available-to-you',
    })
  })

  it('step-05-comes before step 6: no readable package with a bad path gets unsupported', async () => {
    const { access } = createWorld()
    const target: ReadTarget = { capability: noPackage, part: { kind: 'resource', path: '../x' } }
    expect(failureOf(await access.read(alice, scope, target))).toStrictEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })

  it('step-06-comes before the snapshot: a bad path with a moved package gets bad-path', async () => {
    const { access, controls } = createWorld()
    controls.replaceAdopted()
    expect(failureOf(await access.read(alice, scope, resource('../x')))).toStrictEqual({
      kind: 'bad-path',
    })
  })

  it('throws a TypeError for a bad range before any port is called', async () => {
    const { access, controls } = createWorld()
    await expect(
      access.read(mallory, scope, body, { range: { start: -1, length: 1 } }),
    ).rejects.toThrow(TypeError)
    await expect(
      access.read(alice, scope, body, { range: { start: 0, length: 0.5 } }),
    ).rejects.toThrow(TypeError)
    expect(controls.calls()).toStrictEqual({ check: 0, resolve: 0, snapshot: 0, open: 0 })
  })
})

describe('the failures of the later steps, through read', () => {
  it('step-05-unsupported for an identity without a readable package', async () => {
    const { access } = createWorld()
    const target: ReadTarget = { capability: noPackage, part: { kind: 'body' } }
    expect(failureOf(await access.read(alice, scope, target))).toStrictEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })

  it('step-07-adopted-material-changed without a basis when the source moved', async () => {
    const { access, controls } = createWorld()
    controls.replaceAdopted()
    expect(await access.read(alice, scope, body)).toStrictEqual({
      failure: { kind: 'adopted-material-changed' },
    })
  })

  it('step-07-basis-unavailable with a basis of material the source no longer holds', async () => {
    const { access } = createWorld()
    expect(await access.read(alice, scope, body, { basis: earlierBasis })).toStrictEqual({
      failure: { kind: 'basis-unavailable' },
    })
  })

  it('step-09-resource-missing for a path the snapshot does not list, without open', async () => {
    const { access, controls } = createWorld()
    expect(failureOf(await access.read(alice, scope, resource('docs/none.md')))).toStrictEqual({
      kind: 'resource-missing',
    })
    expect(controls.calls().open).toBe(0)
  })

  it('A6 step-10-version-changed gives no content when the bytes moved after the snapshot', async () => {
    const { access, controls } = createWorld()
    controls.tamper(path('docs/guide.md'))
    expect(await access.read(alice, scope, resource('docs/guide.md'))).toStrictEqual({
      failure: { kind: 'version-changed' },
    })
  })
})

describe('the abort checkpoints', () => {
  it('A7 aborted after the snapshot gives no content and calls no port after the abort', async () => {
    const { access, controls } = createWorld()
    const signal = controls.abortAfterSnapshot()
    expect(await access.read(alice, scope, body, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.calls()).toStrictEqual({ check: 1, resolve: 1, snapshot: 1, open: 0 })
  })

  it('an already aborted signal makes read, list and export answer aborted with no port call', async () => {
    const { access, controls } = createWorld()
    const signal = AbortSignal.abort()
    expect(await access.read(alice, scope, body, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(await access.list(alice, scope, review, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(await access.export(alice, scope, review, currentBasis, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.calls()).toStrictEqual({ check: 0, resolve: 0, snapshot: 0, open: 0 })
  })

  it('a signal aborted during the read check makes read answer aborted, not a verdict', async () => {
    const { access, controls } = createWorld()
    const signal = controls.abortAfterCheck()
    expect(await access.read(alice, scope, body, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.calls()).toStrictEqual({ check: 1, resolve: 0, snapshot: 0, open: 0 })
  })
})

describe('no cache', () => {
  it('checks the read right again on the second call of the same service', async () => {
    const { access, controls } = createWorld()
    expect(await access.read(alice, scope, body)).toHaveProperty('ok')
    controls.refuseAll()
    expect(failureOf(await access.read(alice, scope, body))).toStrictEqual({
      kind: 'not-available-to-you',
    })
  })
})

describe('list gives', () => {
  it('the resources of the pinned snapshot without the control files', async () => {
    const { access, controls } = createWorld()
    const listing = okOf(await access.list(alice, scope, review))
    expect(listing.basis).toStrictEqual(currentBasis)
    expect(listing.resources.map(entry => entry.path)).toStrictEqual([
      'assets/blob.bin',
      'docs/front.md',
      'docs/guide.md',
    ])
    expect(listing.resources.map(entry => entry.encoding)).toStrictEqual(['binary', 'text', 'text'])
    expect(listing.resources[2]).toMatchObject({
      mediaType: 'text/markdown',
      size: bytesOf(GUIDE).length,
    })
    expect(controls.calls().open).toBe(0)
  })

  it('step-08-ends after the snapshot digest matches: a basis the source no longer holds fails', async () => {
    const { access } = createWorld()
    expect(
      failureOf(await access.list(alice, scope, review, { basis: earlierBasis })),
    ).toStrictEqual({ kind: 'basis-unavailable' })
    expect(await access.list(alice, scope, review, { basis: currentBasis })).toHaveProperty('ok')
  })

  it('step-05-unsupported and aborted like read', async () => {
    const { access, controls } = createWorld()
    expect(failureOf(await access.list(alice, scope, noPackage))).toStrictEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
    const signal = controls.abortAfterSnapshot()
    expect(await access.list(alice, scope, review, { signal })).toStrictEqual({
      failure: { kind: 'aborted' },
    })
  })
})

describe('the body of a SKILL.md without a legal frontmatter', () => {
  // Not reachable for a material whose digest comes from a package that passed `inspect`: the
  // entry digest is checked at step 10, and `inspect` rejects such bytes. Reachable only when the
  // asset digest comes from elsewhere. The bytes are then not known to be a body.
  it.each([
    ['no frontmatter at all', '# Title\nSome text.\n'],
    ['an opening delimiter without a closing one', '---\nname: review\nNot closed.\n'],
  ])('answers source-unavailable without content for %s', async (_case, manifest) => {
    const files = { 'SKILL.md': manifest, 'docs/guide.md': GUIDE }
    const digest = digestOf('review', files)
    const access = createSkillAccess({
      readCheck: createMemoryReadCheck([{ capability: review, visible: () => true }]),
      resolution: createMemoryResolution([
        {
          capability: review,
          visible: () => true,
          state: {
            kind: 'adopted',
            current: {
              ref: { capability: review, layer: 'workspace', locator: reviewLocator, digest },
              declared: {
                name: granted(isSkillName, 'review'),
                tools: [],
                scripts: [],
                settings: [],
              },
            },
          },
        },
      ]),
      source: createMemorySource([{ locator: reviewLocator, rootName: 'review', files }]),
    })
    expect(await access.read(alice, scope, body)).toStrictEqual({
      failure: { kind: 'source-unavailable' },
    })
    // A resource of the same material is still read whole: only the body needs the header.
    expect(okOf(await access.read(alice, scope, resource('docs/guide.md'))).content).toStrictEqual({
      kind: 'text',
      text: GUIDE,
    })
  })
})
