// The key pattern check of the recorder: every pattern is found, the placeholders that the proxy
// replaces pass, and a finding names its pattern only. The fake keys are built at run time, so this
// source holds none of them.
import { describe, expect, it } from 'vitest'
import { findSecrets, type SecretPattern } from './support/secret-scan.ts'

const bytes = (text: string) => new TextEncoder().encode(text)
const fill = (length: number) => 'Q7'.repeat(length).slice(0, length)

const FAKES: readonly (readonly [SecretPattern, string])[] = [
  ['openrouter-key', `${'sk-'}or-v1-${fill(64)}`],
  ['anthropic-key', `${'sk-'}ant-api03-${fill(40)}`],
  ['openai-project-key', `${'sk-'}proj-${fill(40)}`],
  ['bearer-credential', `Bearer ${fill(24)}`],
  ['aws-access-key', `${'AK'}IA${'ABCDEFGHIJKLMNOP'}`],
  ['private-key', `-----BEGIN ${'RSA PRIVATE'} KEY-----`],
  ['github-token', `${'gh'}p_${fill(36)}`],
  ['github-token', `${'github'}_pat_${fill(30)}`],
]

describe('the key pattern check of a replay file', () => {
  it.each(FAKES)('finds %s inside an SSE data frame', (pattern, fake) => {
    const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: `x ${fake} y` } }] })}\n\n`
    const found = findSecrets(bytes(frame))
    expect(found).toEqual([pattern])
    // The finding is the pattern name, not the text.
    expect(JSON.stringify(found)).not.toContain(fake)
  })

  it('finds a Bearer value that is quoted or JSON-escaped', () => {
    expect(findSecrets(bytes(`"authorization":"Bearer ${fill(20)}"`))).toEqual([
      'bearer-credential',
    ])
    expect(findSecrets(bytes(`Bearer \\"${fill(20)}\\"`))).toEqual(['bearer-credential'])
  })

  it('passes the placeholders that the proxy replaces, and text without a pattern', () => {
    expect(
      findSecrets(bytes('Bearer placeholder and Bearer placeholder-factory-credential')),
    ).toEqual([])
    expect(
      findSecrets(bytes('data: {"choices":[{"delta":{"content":"3 h 25 min"}}]}\n\n')),
    ).toEqual([])
  })

  it('does not take the AWS prefix alone in base64 for a key id', () => {
    expect(findSecrets(bytes(`gAAAAAB${'AKIA'}x9_-${fill(32)}`))).toEqual([])
  })

  it('reads every byte, also when the body is not valid UTF-8', () => {
    const fake = bytes(`${'sk-'}or-v1-${fill(16)}`)
    const body = new Uint8Array([0xff, 0xfe, ...fake, 0xc3])
    expect(findSecrets(body)).toEqual(['openrouter-key'])
  })
})
