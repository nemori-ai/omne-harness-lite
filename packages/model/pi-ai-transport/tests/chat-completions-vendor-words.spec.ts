import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const engineDirectory = new URL('../src/chat-completions/', import.meta.url)

/**
 * Vendor and model-family words. A word matches when no letter comes before it, so `gpt56` and
 * `OpenAI` match, and `maxai` does not.
 */
const VENDOR_WORD =
  /(?<![a-z])(openai|anthropic|claude|gpt|gemini|google|deepseek|grok|xai|qwen|moonshot|kimi|glm|zai)/gi

function engineFiles(): readonly string[] {
  return readdirSync(engineDirectory, { recursive: true, encoding: 'utf8' }).filter(file =>
    file.endsWith('.ts'),
  )
}

it('the engine source names no vendor and no model family', () => {
  const files = engineFiles()
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
