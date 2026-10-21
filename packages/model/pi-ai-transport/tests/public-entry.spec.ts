import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const groupArchitecture = new URL('../../docs/architecture.md', import.meta.url)
const familySource = new URL('../src/family.ts', import.meta.url)

/** Drops comments and every layout difference that the formatter may introduce. */
function shapeTokens(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, '')
    .replace(/[\s,;]/g, '')
    .replaceAll('=|', '=')
}

function acceptedCodeBlock(markdown: string): string {
  const section = markdown.split('## pi 家族贡献的取得协议')[1]
  const block = section?.match(/```ts\n([\s\S]*?)```/)?.[1]
  if (block === undefined) throw new Error('the accepted pi family code block is missing')
  return block
}

it('the root entry has no runtime export; it carries the accepted types only', async () => {
  const root: object = await import('@omne-harness/pi-ai-transport')
  expect(Object.keys(root)).toEqual([])
})

it('the family types keep the shape of the accepted group architecture code block', () => {
  const accepted = acceptedCodeBlock(readFileSync(groupArchitecture, 'utf8'))
  expect(shapeTokens(readFileSync(familySource, 'utf8'))).toBe(shapeTokens(accepted))
})
