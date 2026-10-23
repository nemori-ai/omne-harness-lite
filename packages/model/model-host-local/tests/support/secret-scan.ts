// Test support of the recorder: the key pattern check that a replay file passes before it is
// written. A finding names its pattern only; the matched text never leaves this module, so a
// refusal can be printed without printing the secret it found.

/** The names of the patterns. A finding is one of these, never the text that matched. */
export type SecretPattern =
  | 'openrouter-key'
  | 'anthropic-key'
  | 'openai-project-key'
  | 'bearer-credential'
  | 'aws-access-key'
  | 'private-key'
  | 'github-token'

/**
 * The values a `Bearer` credential may hold in a replay file: the placeholders that the tests and
 * the recorder send, and that the proxy replaces. Any other value is a finding.
 */
const PLACEHOLDERS: ReadonlySet<string> = new Set(['placeholder', 'placeholder-factory-credential'])

const PATTERNS: readonly Readonly<{ name: SecretPattern; pattern: RegExp }>[] = [
  { name: 'openrouter-key', pattern: /sk-or-v1/u },
  { name: 'anthropic-key', pattern: /sk-ant/u },
  { name: 'openai-project-key', pattern: /sk-proj/u },
  // The AWS access key id format: the prefix and 16 upper-case letters or digits. The prefix
  // alone occurs by chance in the base64 of an encrypted reasoning state.
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/u },
  { name: 'private-key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u },
  {
    name: 'github-token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_\w{22,}/u,
  },
]

/** A `Bearer` and its value, also when the value is quoted, with or without a JSON escape. */
const BEARER = /Bearer\s+(?:\\?["'])?([^\s"'\\,;]+)/gu

/**
 * The patterns that occur in the bytes, each once, in the order of the table. The bytes are read
 * as Latin-1, one character per byte, so a pattern matches whatever the encoding of the rest is.
 * An empty result means that no pattern occurs.
 */
export function findSecrets(bytes: Uint8Array): readonly SecretPattern[] {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
  const found: SecretPattern[] = []
  for (const { name, pattern } of PATTERNS) if (pattern.test(text)) found.push(name)
  for (const match of text.matchAll(BEARER))
    if (!PLACEHOLDERS.has(match[1] ?? '')) {
      found.push('bearer-credential')
      break
    }
  return found
}
