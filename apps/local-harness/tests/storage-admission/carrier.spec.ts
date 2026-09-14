import { describe, expect, it } from 'vitest'

describe('storage/admission integration carrier', () => {
  it('runs under the Node major declared by the application package', () => {
    expect(process.versions.node.split('.')[0]).toBe('24')
  })
})
