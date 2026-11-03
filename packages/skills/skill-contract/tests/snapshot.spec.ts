import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computeDigest } from '@omne-harness/skill-contract'
import { sealSnapshot } from '@omne-harness/skill-contract/provider'
import { bytesOf, path } from './package-builder.ts'

function files(map: Readonly<Record<string, string | Uint8Array>>) {
  return Object.entries(map).map(([raw, content]) => ({ path: path(raw), bytes: bytesOf(content) }))
}

function seal(rootName: string, map: Readonly<Record<string, string | Uint8Array>>) {
  return sealSnapshot({ rootName, files: files(map) })
}

describe('sealSnapshot', () => {
  it.each(['', 'a/b', '/'])('rejects the root name %j', rootName => {
    expect(seal(rootName, { 'SKILL.md': 's' })).toEqual({ failure: { kind: 'invalid-root-name' } })
  })

  it('checks the root name before the paths', () => {
    const repeated = [...files({ a: 'x' }), ...files({ a: 'y' })]
    expect(sealSnapshot({ rootName: '', files: repeated })).toEqual({
      failure: { kind: 'invalid-root-name' },
    })
  })

  it('rejects a repeated path', () => {
    const repeated = [...files({ a: 'x' }), ...files({ './a': 'y' })]
    expect(sealSnapshot({ rootName: 'demo', files: repeated })).toEqual({
      failure: { kind: 'duplicate-path', path: 'a' },
    })
  })

  it('rejects a file that is also a directory, even when the two paths do not sort next to each other', () => {
    expect(seal('demo', { a: '1', 'a-b': '2', 'a/b': '3' })).toEqual({
      failure: { kind: 'prefix-conflict', file: 'a', nested: 'a/b' },
    })
    expect(seal('demo', { 'x/y': '1', 'x/y.z': '2', 'x/y/z/w': '3' })).toEqual({
      failure: { kind: 'prefix-conflict', file: 'x/y', nested: 'x/y/z/w' },
    })
  })

  it('accepts sibling paths that share a text prefix', () => {
    expect(seal('demo', { a: '1', 'a-b': '2', 'ab/c': '3' })).toHaveProperty('ok')
  })

  it('computes every entry fact from the bytes and sorts the entries by path', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
    const sealed = seal('demo', {
      'scripts/run.sh': 'echo',
      'SKILL.md': '---\n',
      'assets/blob': png,
      'notes.txt': new Uint8Array([0xff]),
    })
    if (!('ok' in sealed)) throw new Error('must seal')
    expect(sealed.ok.rootName).toBe('demo')
    expect(sealed.ok.entries).toEqual([
      {
        path: 'SKILL.md',
        encoding: 'text',
        size: 4,
        mediaType: 'text/markdown',
        digest: computeDigest(bytesOf('---\n')),
      },
      {
        path: 'assets/blob',
        encoding: 'binary',
        size: 9,
        mediaType: 'image/png',
        digest: computeDigest(png),
      },
      {
        path: 'notes.txt',
        encoding: 'binary',
        size: 1,
        mediaType: 'text/plain',
        digest: computeDigest(new Uint8Array([0xff])),
      },
      {
        path: 'scripts/run.sh',
        encoding: 'text',
        size: 4,
        mediaType: 'application/x-sh',
        digest: computeDigest(bytesOf('echo')),
      },
    ])
    expect(Object.isFrozen(sealed.ok)).toBe(true)
    expect(Object.isFrozen(sealed.ok.entries)).toBe(true)
    expect(Object.isFrozen(sealed.ok.entries[0])).toBe(true)
  })

  it('treats text with a NUL character as binary and leaves an unknown type absent', () => {
    const sealed = seal('demo', { 'data/raw': 'a\0b' })
    if (!('ok' in sealed)) throw new Error('must seal')
    expect(sealed.ok.entries[0]).toEqual({
      path: 'data/raw',
      encoding: 'binary',
      size: 3,
      digest: computeDigest(bytesOf('a\0b')),
    })
  })

  it('computes the digest from the sorted paths and entry digests as the SPEC writes it', () => {
    const sealed = seal('demo', { b: 'B', a: 'A' })
    if (!('ok' in sealed)) throw new Error('must seal')
    const hash = createHash('sha256')
    hash.update(`a\0${computeDigest(bytesOf('A'))}\n`)
    hash.update(`b\0${computeDigest(bytesOf('B'))}\n`)
    expect(sealed.ok.digest).toBe(`sha256:${hash.digest('hex')}`)
  })

  it('gives a digest that does not depend on the entry order or the root name', () => {
    const one = seal('first-root', { 'SKILL.md': 's', 'a/b': 'x', c: 'y' })
    const two = seal('other-root', { c: 'y', 'SKILL.md': 's', 'a/b': 'x' })
    if (!('ok' in one) || !('ok' in two)) throw new Error('must seal')
    expect(two.ok.digest).toBe(one.ok.digest)
    expect(two.ok.entries).toEqual(one.ok.entries)
  })

  it('sorts input given in descending order and gives the digest of the ascending input', () => {
    const descending = seal('demo', { z: '3', y: '2', x: '1' })
    const ascending = seal('demo', { x: '1', y: '2', z: '3' })
    if (!('ok' in descending) || !('ok' in ascending)) throw new Error('must seal')
    expect(descending.ok.entries.map(entry => entry.path)).toEqual(['x', 'y', 'z'])
    expect(descending.ok.digest).toBe(ascending.ok.digest)
  })

  it('gives a different digest when one byte, one path or one entry changes', () => {
    const base = seal('demo', { a: 'x', b: 'y' })
    const byte = seal('demo', { a: 'x', b: 'z' })
    const moved = seal('demo', { a: 'x', c: 'y' })
    const more = seal('demo', { a: 'x', b: 'y', c: '' })
    if (!('ok' in base) || !('ok' in byte) || !('ok' in moved) || !('ok' in more))
      throw new Error('must seal')
    const digests = new Set([base.ok.digest, byte.ok.digest, moved.ok.digest, more.ok.digest])
    expect(digests.size).toBe(4)
  })

  it('sorts by UTF-16 code units, so the digest is fixed for paths outside ASCII', () => {
    const sealed = seal('demo', { '\uff61': '0', é: '1', z: '2', '\u{1f600}': '3', Z: '4' })
    if (!('ok' in sealed)) throw new Error('must seal')
    expect(sealed.ok.entries.map(entry => entry.path)).toEqual([
      'Z',
      'z',
      'é',
      '\u{1f600}',
      '\uff61',
    ])
  })
})
