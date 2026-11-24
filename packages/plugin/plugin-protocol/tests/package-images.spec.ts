import { describe, expect, it } from 'vitest'
import {
  IMAGE_SUFFIXES,
  fileRefs,
  imageFault,
  judgePackage,
  type PackageFile,
  type PluginManifest,
} from '@omne-harness/plugin-protocol'

const file = (path: string): PackageFile => ({ path, digest: `d:${path}` })
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)
const text = (words: string): Uint8Array => new TextEncoder().encode(words)

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46)
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50)
const AVIF = bytes(0, 0, 0, 28, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0)
const SVG = text('<?xml version="1.0"?>\n<!-- art -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')
const HTML = text('<!doctype html><html><script>alert(1)</script></html>')

const skin = (data: unknown): PluginManifest => ({
  schema: 1,
  name: 'sea',
  summary: 'A skin.',
  kind: 'skin',
  client: {
    members: [
      { point: 'shell.part-style', key: 'session.backdrop', data: data as never },
      { point: 'shell.part-render', key: 'session.header', module: 'head.js', export: 'head' },
    ],
  },
})
const FILES = [file('plugin.json'), file('head.js'), file('art/sea.webp'), file('art/mark.svg')]

describe('the images a package may carry', () => {
  it('are these five kinds, beside the kinds it carried before', () => {
    expect(IMAGE_SUFFIXES).toEqual(['.png', '.jpg', '.webp', '.avif', '.svg'])
    expect(judgePackage(skin({ base: {} }), FILES)).toEqual({ ok: true })
  })

  it.each(['art/sea.gif', 'art/font.woff2', 'art/page.html'])(
    'still refuses a file of another kind: %s',
    path => {
      const judged = judgePackage(skin({ base: {} }), [...FILES, file(path)])
      expect(judged).toEqual({
        ok: false,
        reason: `the file ${path} is not one of .js, .css, .json, .png, .jpg, .webp, .avif, .svg`,
      })
    },
  )
})

describe('an image told from what only bears its name', () => {
  it.each<[string, Uint8Array]>([
    ['a.png', PNG],
    ['a.jpg', JPG],
    ['a.webp', WEBP],
    ['a.avif', AVIF],
    ['a.svg', SVG],
    ['a.svg', text('  <svg viewBox="0 0 1 1"></svg>')],
    [
      'a.svg',
      text(
        '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg/>',
      ),
    ],
    ['a.avif', bytes(0, 0, 0, 28, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73, 0, 0)],
    [
      'a.avif',
      bytes(
        0,
        0,
        0,
        24,
        0x66,
        0x74,
        0x79,
        0x70,
        0x6d,
        0x69,
        0x66,
        0x31,
        0,
        0,
        0,
        0,
        0x6d,
        0x69,
        0x66,
        0x31,
        0x61,
        0x76,
        0x69,
        0x66,
      ),
    ],
  ])('%s that begins as its kind does is that image', (path, head) => {
    expect(imageFault(path, head)).toBeNull()
  })

  it.each<[string, Uint8Array]>([
    ['a.png', HTML],
    ['a.jpg', PNG],
    ['a.webp', bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)],
    ['a.avif', bytes(0, 0, 0, 28, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32)],
    ['a.svg', HTML],
    ['a.svg', text('<html><body><svg/></body></html>')],
    [
      'a.avif',
      bytes(
        0,
        0,
        0,
        20,
        0x66,
        0x74,
        0x79,
        0x70,
        0x68,
        0x65,
        0x69,
        0x63,
        0,
        0,
        0,
        0,
        0x6d,
        0x69,
        0x66,
        0x31,
      ),
    ],
    ['a.avif', bytes(0, 0, 0, 16, 0x6d, 0x6f, 0x6f, 0x76, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0)],
    [
      'a.avif',
      bytes(
        0,
        0,
        0,
        16,
        0x66,
        0x74,
        0x79,
        0x70,
        0x6d,
        0x69,
        0x66,
        0x31,
        0,
        0,
        0,
        0,
        0x61,
        0x76,
        0x69,
        0x66,
      ),
    ],
    ['a.svg', text('<svgx/>')],
    ['a.png', bytes()],
  ])('%s that begins otherwise is refused, and the reason names the file', (path, head) => {
    expect(imageFault(path, head)).toBe(`the file ${path} is not the image its name says`)
  })

  it('a file that is no image by its name is not judged here', () => {
    expect(imageFault('a.js', HTML)).toBeNull()
  })
})

describe('the files a value points at', () => {
  it('are the paths written in file(…), in the order written, each once', () => {
    expect(
      fileRefs('file(art/sea.webp) no-repeat, file( art/mark.svg ), file(art/sea.webp)'),
    ).toEqual(['art/sea.webp', 'art/mark.svg'])
    expect(fileRefs('color-mix(in srgb, red 10%, blue)')).toEqual([])
    expect(fileRefs('profile(a.png)')).toEqual([])
  })

  it('a data member that points at a file the package carries is whole', () => {
    const data = {
      base: { 'background-image': 'file(art/sea.webp)' },
      hover: { mask: 'file(art/mark.svg)' },
    }
    expect(judgePackage(skin(data), FILES)).toEqual({ ok: true })
  })

  it('a data member whose values are null, numbers or truths points at nothing', () => {
    const data = { base: { opacity: 1, 'z-index': null }, hover: { visible: true } }
    expect(judgePackage(skin(data), FILES)).toEqual({ ok: true })
  })

  it('a data member that points at a file the package does not carry is refused, and the reason names the member and the file', () => {
    const data = { base: { 'background-image': 'file(art/none.png)' } }
    expect(judgePackage(skin(data), FILES)).toEqual({
      ok: false,
      reason: 'client.members[0]: the file art/none.png it points at is not in the package',
    })
  })
})
