// `read` and `list` through the public service: the body from its start, resources as text or
// bytes, the path check, the failures of the steps in order, no partial content on
// `version-changed` and `aborted`, and no cache between two calls.
import { describe, expect, it } from 'vitest'
import type { ReadTarget } from '@omne-harness/skill-contract'
import {
  alice,
  BLOB,
  BODY,
  bytesOf,
  createWorld,
  currentBasis,
  earlierBasis,
  failureOf,
  FRONT,
  GUIDE,
  mallory,
  noPackage,
  okOf,
  path,
  review,
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
    expect(result).toEqual({
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
    expect(result.content).toEqual({ kind: 'text', text: 'Read' })
    expect(result.complete).toBe(false)
  })

  it('a text resource with its media type', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('docs/guide.md')))
    expect(result.part).toEqual({ kind: 'resource', path: 'docs/guide.md' })
    expect(result.mediaType).toBe('text/markdown')
    expect(result.content).toEqual({ kind: 'text', text: GUIDE })
  })

  it('a resource whole, even when its text looks like a frontmatter', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('docs/front.md')))
    expect(result.content).toEqual({ kind: 'text', text: FRONT })
    expect(result.total).toBe(bytesOf(FRONT).length)
  })

  it('a binary resource as bytes without a media type', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('assets/blob.bin')))
    expect(result.mediaType).toBeUndefined()
    expect(result.content).toEqual({ kind: 'bytes', bytes: BLOB })
    expect(result.total).toBe(BLOB.length)
  })

  it('the material that a basis names, when the source still holds it', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, body, { basis: currentBasis }))
    expect(result.basis).toEqual(currentBasis)
  })
})

describe('step 6: the path', () => {
  it.each([
    '../x.md',
    '/docs/guide.md',
    'docs//guide.md',
    'docs\\guide.md',
    '',
    'SKILL.md',
    '.omne/skill.json',
  ])('step-06-bad-path for %j', async raw => {
    const { access, controls } = createWorld()
    expect(failureOf(await access.read(alice, scope, resource(raw)))).toEqual({ kind: 'bad-path' })
    expect(controls.opens()).toBe(0)
  })

  it('step-06-normalizes a path with a dot segment', async () => {
    const { access } = createWorld()
    const result = okOf(await access.read(alice, scope, resource('./docs/guide.md')))
    expect(result.part).toEqual({ kind: 'resource', path: 'docs/guide.md' })
  })

  it('step-06-comes after the gate: a stranger with a bad path gets not-available-to-you', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.read(mallory, scope, resource('../x')))).toEqual({
      kind: 'not-available-to-you',
    })
  })

  it('step-06-comes before the snapshot: a bad path with a moved package gets bad-path', async () => {
    const { access, controls } = createWorld()
    controls.replaceAdopted()
    expect(failureOf(await access.read(alice, scope, resource('../x')))).toEqual({
      kind: 'bad-path',
    })
  })
})

describe('the failures of the later steps, through read', () => {
  it('step-05-unsupported for an identity without a readable package', async () => {
    const { access } = createWorld()
    const target: ReadTarget = { capability: noPackage, part: { kind: 'body' } }
    expect(failureOf(await access.read(alice, scope, target))).toEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
  })

  it('step-07-adopted-material-changed without a basis when the source moved', async () => {
    const { access, controls } = createWorld()
    controls.replaceAdopted()
    expect(await access.read(alice, scope, body)).toEqual({
      failure: { kind: 'adopted-material-changed' },
    })
  })

  it('step-07-basis-unavailable with a basis of material the source no longer holds', async () => {
    const { access } = createWorld()
    expect(await access.read(alice, scope, body, { basis: earlierBasis })).toEqual({
      failure: { kind: 'basis-unavailable' },
    })
  })

  it('step-09-resource-missing for a path the snapshot does not list', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.read(alice, scope, resource('docs/none.md')))).toEqual({
      kind: 'resource-missing',
    })
  })

  it('A6 step-10-version-changed gives no content when the bytes moved after the snapshot', async () => {
    const { access, controls } = createWorld()
    controls.tamper(path('docs/guide.md'))
    expect(await access.read(alice, scope, resource('docs/guide.md'))).toEqual({
      failure: { kind: 'version-changed' },
    })
  })

  it('A7 aborted gives no content and calls no port after the abort', async () => {
    const { access, controls } = createWorld()
    const signal = controls.abortAfterSnapshot()
    expect(await access.read(alice, scope, body, { signal })).toEqual({
      failure: { kind: 'aborted' },
    })
    expect(controls.opens()).toBe(0)
  })

  it('throws a TypeError for a range that is not two non-negative integers', async () => {
    const { access } = createWorld()
    await expect(
      access.read(alice, scope, body, { range: { start: -1, length: 1 } }),
    ).rejects.toThrow(TypeError)
    await expect(
      access.read(alice, scope, body, { range: { start: 0, length: 0.5 } }),
    ).rejects.toThrow(TypeError)
  })
})

describe('no cache', () => {
  it('checks the read right again on the second call of the same service', async () => {
    const { access, controls } = createWorld()
    expect(await access.read(alice, scope, body)).toHaveProperty('ok')
    controls.refuseAll()
    expect(failureOf(await access.read(alice, scope, body))).toEqual({
      kind: 'not-available-to-you',
    })
  })
})

describe('list gives', () => {
  it('the resources of the pinned snapshot without the control files', async () => {
    const { access, controls } = createWorld()
    const listing = okOf(await access.list(alice, scope, review))
    expect(listing.basis).toEqual(currentBasis)
    expect(listing.resources.map(entry => entry.path)).toEqual([
      'assets/blob.bin',
      'docs/front.md',
      'docs/guide.md',
    ])
    expect(listing.resources.map(entry => entry.encoding)).toEqual(['binary', 'text', 'text'])
    expect(listing.resources[2]).toMatchObject({
      mediaType: 'text/markdown',
      size: bytesOf(GUIDE).length,
    })
    expect(controls.opens()).toBe(0)
  })

  it('step-08-ends after the snapshot digest matches: a basis the source no longer holds fails', async () => {
    const { access } = createWorld()
    expect(failureOf(await access.list(alice, scope, review, { basis: earlierBasis }))).toEqual({
      kind: 'basis-unavailable',
    })
    expect(await access.list(alice, scope, review, { basis: currentBasis })).toHaveProperty('ok')
  })

  it('step-05-unsupported and aborted like read', async () => {
    const { access, controls } = createWorld()
    expect(failureOf(await access.list(alice, scope, noPackage))).toEqual({
      kind: 'unsupported',
      what: 'no-readable-package',
    })
    const signal = controls.abortAfterSnapshot()
    expect(await access.list(alice, scope, review, { signal })).toEqual({
      failure: { kind: 'aborted' },
    })
  })
})
