import { describe, expect, it } from 'vitest'
import {
  fileEffects,
  segmentsBelow,
  windowsPathSegments,
  withinScope,
  type FilesScope,
} from '../src/index.ts'

const blog: FilesScope = { read: '/home/a', write: '/home/a/blog' }

describe('whether a path lies in a files scope, by segments only', () => {
  it('lets anything through on a side with no root', () => {
    expect(withinScope({}, 'read', '/etc/passwd', 'linux')).toBe(true)
    expect(withinScope({ read: '/home/a' }, 'write', '/etc/passwd', 'linux')).toBe(true)
  })

  it('takes the root of the effect: reads below the read root, writes below the write root', () => {
    expect(withinScope(blog, 'read', '/home/a/notes.txt', 'linux')).toBe(true)
    expect(withinScope(blog, 'write', '/home/a/notes.txt', 'linux')).toBe(false)
    expect(withinScope(blog, 'write', '/home/a/blog/post.md', 'linux')).toBe(true)
    expect(withinScope(blog, 'write', '/home/a/blog', 'linux')).toBe(true)
  })

  it('is not fooled by a sibling with the same prefix, `..`, a relative path or a NUL', () => {
    for (const path of [
      '/home/a/blogger/x',
      '/home/a/blog/../x',
      'home/a/blog/x',
      '/home/a/blog/\0x',
    ])
      expect(withinScope(blog, 'write', path, 'linux'), path).toBe(false)
    expect(withinScope(blog, 'write', '/home/a/blog/./x', 'linux')).toBe(true)
    expect(withinScope(blog, 'write', '/home//a/blog/x', 'linux')).toBe(true)
  })

  it('gives the segments below the root, in their own case on Windows', () => {
    expect(segmentsBelow('/home/a', '/home/a/b/c', 'darwin')).toEqual(['b', 'c'])
    expect(segmentsBelow('/home/a', '/home/a', 'darwin')).toEqual([])
    expect(segmentsBelow('/home/a', '/home', 'darwin')).toBeUndefined()
    expect(segmentsBelow('C:\\Users\\a', 'c:/users/A/New File.txt', 'win32')).toEqual([
      'New File.txt',
    ])
    expect(segmentsBelow('C:\\Users\\a', 'D:\\Users\\a\\x', 'win32')).toBeUndefined()
    expect(segmentsBelow('/home/a', '/home/A/x', 'linux')).toBeUndefined()
  })

  it('refuses Windows paths that are not plain absolute ones', () => {
    expect(windowsPathSegments('relative\\x')).toEqual({ ok: false, refusal: 'form' })
    expect(windowsPathSegments('C:\\a\\..\\b')).toEqual({ ok: false, refusal: 'parent' })
    expect(windowsPathSegments('C:\\a\\con')).toEqual({ ok: false, refusal: 'form' })
    expect(windowsPathSegments('C:\\a\\x:stream')).toEqual({ ok: false, refusal: 'form' })
    expect(windowsPathSegments('C:\\a\\trailing.')).toEqual({ ok: false, refusal: 'form' })
    expect(withinScope({ write: 'C:\\a' }, 'write', 'C:\\a\\..\\b', 'win32')).toBe(false)
  })
})

it('limits reads by the read root and writes by the write root; a move or copy reads its source and writes its target', () => {
  // execution SPEC: reads are read, stat, list and search; writes are write, remove and mkdir.
  expect(fileEffects).toEqual({
    read: { path: 'read' },
    stat: { path: 'read' },
    list: { path: 'read' },
    search: { path: 'read' },
    recoverBatch: { path: 'read' },
    write: { path: 'write' },
    mkdir: { path: 'write' },
    remove: { path: 'write' },
    commitBatch: { path: 'write' },
    move: { path: 'read', target: 'write' },
    copy: { path: 'read', target: 'write' },
  })
  expect(Object.isFrozen(fileEffects)).toBe(true)
})
