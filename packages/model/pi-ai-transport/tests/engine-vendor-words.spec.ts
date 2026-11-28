import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const ENGINES = ['chat-completions', 'messages', 'responses'] as const

const VENDOR_WORD =
  /(?<![a-z])(openai|anthropic|claude|gpt|gemini|google|deepseek|grok|xai|qwen|moonshot|kimi|glm|zai)/gi

function engineFiles(engineDirectory: URL): readonly string[] {
  return readdirSync(engineDirectory, { recursive: true, encoding: 'utf8' }).filter(file =>
    file.endsWith('.ts'),
  )
}

it.each(ENGINES)('the %s engine source names no vendor and no model family', engine => {
  const engineDirectory = new URL(`../src/${engine}/`, import.meta.url)
  const files = engineFiles(engineDirectory)
  expect(files.length).toBeGreaterThan(0)
  const hits = files.flatMap(file =>
    readFileSync(new URL(file, engineDirectory), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        [...line.matchAll(VENDOR_WORD)].map(match => `${file}:${index + 1}: ${match[0]}`),
      ),
  )
  expect(hits).toEqual([])
})

it('the scan finds a vendor word where one is written', () => {
  expect('use OpenAI here, or gpt56, not maxai'.match(VENDOR_WORD)).toEqual(['OpenAI', 'gpt'])
})

const PROVIDER_WORD = /(?<![a-z])(openrouter|typesafe|jev)/gi

function codeLines(text: string): readonly string[] {
  return text.split('\n').map(line => (/^\s*(\/\/|\/\*|\*)/u.test(line) ? '' : line))
}

function wordsIn(directory: URL, files: readonly string[]): readonly string[] {
  return files.flatMap(file =>
    codeLines(readFileSync(new URL(file, directory), 'utf8')).flatMap((line, index) =>
      [...line.matchAll(VENDOR_WORD), ...line.matchAll(PROVIDER_WORD)].map(
        match => `${file}:${index + 1}: ${match[0]}`,
      ),
    ),
  )
}

it('the transport core and the decisions codec name no provider, no vendor and no model in their code', () => {
  const core = new URL('../src/', import.meta.url)
  const coreFiles = readdirSync(core, { encoding: 'utf8' }).filter(file => file.endsWith('.ts'))
  const decisions = new URL('../src/decisions/', import.meta.url)
  expect(coreFiles).toContain('transport.ts')
  expect(engineFiles(decisions)).toContain('codec.ts')
  expect(wordsIn(core, coreFiles)).toEqual([])
  expect(wordsIn(decisions, engineFiles(decisions))).toEqual([])
})

it('the scan reads code and not comments, and finds a provider word where one is written', () => {
  expect(codeLines("// only openrouter\nif (place === 'openrouter') {}")).toEqual([
    '',
    "if (place === 'openrouter') {}",
  ])
  expect(
    "place === 'openrouter' || model.startsWith('typesafe/jev-')".match(PROVIDER_WORD),
  ).toEqual(['openrouter', 'typesafe', 'jev'])
})
