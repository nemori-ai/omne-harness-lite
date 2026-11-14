export type SecretPattern =
  | 'openrouter-key'
  | 'anthropic-key'
  | 'openai-project-key'
  | 'bearer-credential'
  | 'aws-access-key'
  | 'private-key'
  | 'github-token'

const PLACEHOLDERS: ReadonlySet<string> = new Set(['placeholder', 'placeholder-factory-credential'])

const PATTERNS: readonly Readonly<{ name: SecretPattern; pattern: RegExp }>[] = [
  { name: 'openrouter-key', pattern: /sk-or-v1/u },
  { name: 'anthropic-key', pattern: /sk-ant/u },
  { name: 'openai-project-key', pattern: /sk-proj/u },
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/u },
  { name: 'private-key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u },
  {
    name: 'github-token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_\w{22,}/u,
  },
]

const BEARER = /Bearer\s+(?:\\?["'])?([^\s"'\\,;]+)/gu

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
