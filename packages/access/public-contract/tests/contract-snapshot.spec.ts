import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { checkRecorded, contractDigest } from '@omne-harness/public-contract/snapshot'
import { expect, it } from 'vitest'
import { accessProtocol, defineProtocol, ruleCodec } from '@omne-harness/public-contract'

const file = new URL('../contract/access.v1.json', import.meta.url)

it('every published revision of access/v1 still reads as recorded (V4)', async () => {
  const problems = await checkRecorded(accessProtocol, {
    read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    write: text => writeFileSync(file, text),
    append: process.env['OMNE_CONTRACT_SNAPSHOT'] === 'append',
  })
  expect(problems).toEqual([])
})

const sha256 = (bytes: Uint8Array): Uint8Array => createHash('sha256').update(bytes).digest()

it("the digest worked out with the caller's SHA-256 is the one the snapshot records, for every revision", () => {
  const { digests } = JSON.parse(readFileSync(file, 'utf8')) as { digests: Record<string, string> }
  expect(Object.keys(digests)).toEqual(['1', '2'])
  for (const [revision, recorded] of Object.entries(digests))
    expect(contractDigest(accessProtocol, Number(revision), sha256)).toBe(recorded)
})

it('a protocol with a codec written by hand has no digest: there is no rule to work it out from', () => {
  // A codec without the rule it was built from: what a hand-written one looks like.
  const { rule: _rule, ...byHand } = ruleCodec({ kind: 'object', fields: {} })
  const protocol = defineProtocol({
    name: 'by-hand',
    major: 1,
    operations: {
      ping: {
        identity: 'none',
        effect: 'read',
        limit: 'small',
        body: byHand,
        outcomes: { succeeded: byHand },
      },
    },
    observations: {},
  })
  expect(contractDigest(protocol, 1, sha256)).toBeUndefined()
})
