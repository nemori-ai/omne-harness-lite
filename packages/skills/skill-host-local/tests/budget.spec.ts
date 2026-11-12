// The walk visits at most 65536 entries, counting every name of every listing, also when links
// reach one directory many times. Links can multiply the visits without a cycle: two links per
// level that point to the next level give 2^n visits at depth n. Past the budget the package
// is unreadable. The seam is a tree in memory, so no case writes 65536 files.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDirectorySource, type DirectoryFs } from '@omne-harness/skill-host-local'

const encoder = new TextEncoder()
const BYTES = encoder.encode('text\n')

function refusal(path: string): Error {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
}

/** A tree in memory: `dirs` maps a directory to its names, `links` maps a path to its target. */
function memoryFs(
  dirs: ReadonlyMap<string, readonly string[]>,
  links: ReadonlyMap<string, string> = new Map(),
): DirectoryFs {
  return {
    readdir: async path => {
      const names = dirs.get(path)
      if (names === undefined) throw refusal(path)
      return names.map(name => encoder.encode(name))
    },
    realpath: async path => encoder.encode(links.get(path) ?? path),
    lstat: async path => ({ isFile: () => !dirs.has(path), isDirectory: () => dirs.has(path) }),
    readFile: async path => {
      if (dirs.has(path)) throw refusal(path)
      return { kind: 'file', bytes: BYTES }
    },
  }
}

/** `count` files directly in `/pkg`. */
function flat(count: number): DirectoryFs {
  const names = Array.from({ length: count }, (_, index) => `f${index}`)
  return memoryFs(new Map([['/pkg', names]]))
}

/**
 * Levels `/pkg`, `/pkg/L1` … `/pkg/L<depth>`. Each level above the last holds the links `a` and
 * `b` to the next level; the last level holds `f.md`. The visits are 2 + 4 + … + 2^depth for the
 * links and 2^depth for the files.
 */
function fanOut(depth: number): DirectoryFs {
  const level = (index: number) => (index === 0 ? '/pkg' : `/pkg/L${index}`)
  const dirs = new Map<string, readonly string[]>()
  const links = new Map<string, string>()
  for (let index = 0; index < depth; index += 1) {
    dirs.set(level(index), ['a', 'b'])
    links.set(join(level(index), 'a'), level(index + 1))
    links.set(join(level(index), 'b'), level(index + 1))
  }
  dirs.set(level(depth), ['f.md'])
  return memoryFs(dirs, links)
}

async function snapshotOf(fs: DirectoryFs) {
  const answer = await createDirectorySource({ fs }).snapshot(directory())
  return 'ok' in answer ? { entries: answer.ok.entries.length } : answer
}

function directory() {
  return { kind: 'directory', root: '/pkg' } as const
}

describe('the visit budget of one walk', () => {
  it('admits exactly 65536 visits', async () => {
    expect(await snapshotOf(flat(65_536))).toEqual({ entries: 65_536 })
  })

  it('makes snapshot answer entry-unreadable at 65537 visits', async () => {
    expect(await snapshotOf(flat(65_537))).toEqual({ failure: 'entry-unreadable' })
  })

  it('counts the visits that links repeat, under and over the budget', async () => {
    expect(await snapshotOf(fanOut(14))).toEqual({ entries: 16_384 })
    expect(await snapshotOf(fanOut(15))).toEqual({ failure: 'entry-unreadable' })
  })

  it('stops a fan-out that would visit millions of entries', async () => {
    expect(await snapshotOf(fanOut(24))).toEqual({ failure: 'entry-unreadable' })
  })
})
