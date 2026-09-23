import { describe, expect, it } from 'vitest'

describe('tenancy-host 骨架', () => {
  it('包可被装载（实现在 W3-A）', async () => {
    await expect(import('../src/index.ts')).resolves.toBeDefined()
  })
})
