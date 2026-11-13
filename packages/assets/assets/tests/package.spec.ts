// The digests of SPEC「正文是目录的类别」: known values for fixed input, and a package digest that
// does not depend on the order of the entries.
import { describe, expect, it } from 'vitest'
import { digestBytes, packageDigest } from '../src/index.ts'

const encoder = new TextEncoder()

describe('digestBytes', () => {
  it.each([
    ['', 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('gives the known SHA-256 of %j', (text, digest) => {
    expect(digestBytes(encoder.encode(text))).toBe(digest)
  })
})

describe('packageDigest', () => {
  const skill = {
    path: 'SKILL.md',
    digest: 'sha256:a7937b64b8caa58f03721bb6bacf5c78cb235febe0e70b1b84cd99541461a08e',
  }
  const script = {
    path: 'scripts/run.sh',
    digest: 'sha256:8ff76b84557c1745fe2003155f68de27f0c501ccceefd947b5746fe7a7de831e',
  }

  it('gives the known digest of `<path>\\0<digest>\\n` for each entry in path order', () => {
    expect(packageDigest([skill, script])).toBe(
      'sha256:5c84fd2a9636516cf2da8e7e585f434a4a4da68f1ca81a38cf6982ab6af97e5a',
    )
  })

  it('gives the same digest whatever the order of the entries', () => {
    expect(packageDigest([script, skill])).toBe(packageDigest([skill, script]))
  })

  it('orders the paths by UTF-16 code units: an uppercase letter comes before a lowercase one', () => {
    const upper = { path: 'B', digest: skill.digest }
    const lower = { path: 'a', digest: script.digest }
    const inOrder = packageDigest([upper, lower])
    expect(packageDigest([lower, upper])).toBe(inOrder)
    expect(inOrder).toBe(digestBytes(encoder.encode(`B\0${skill.digest}\na\0${script.digest}\n`)))
  })

  it('gives the digest of no bytes for a package without entries', () => {
    expect(packageDigest([])).toBe(digestBytes(new Uint8Array()))
  })
})
