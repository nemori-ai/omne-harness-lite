import { describe, expect, it } from 'vitest'

describe('governance-center-entry 骨架', () => {
  it('包可被装载（实现在 W2-B）', async () => {
    await expect(import('../src/index.ts')).resolves.toBeDefined()
  })
})
