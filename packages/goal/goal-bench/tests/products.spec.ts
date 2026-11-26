// @module-tag slow
import { describe, expect, it } from 'vitest'
import { MINIMUM, productSetIssues } from '../src/examine/checks.ts'
import { examCasesOf, loadProducts } from '../src/examine/product.ts'

describe('the kept products of the examiner’s bench', () => {
  it(
    'have no issue: every check passes on the product clean, and each break fails the check of its own criterion and no other',
    { tags: ['slow'], timeout: 300_000 },
    () => {
      const products = loadProducts()
      expect(productSetIssues(products)).toEqual([])
      expect(products.length).toBeGreaterThanOrEqual(MINIMUM.products)
      const cases = products.flatMap(examCasesOf)
      expect(cases.some(entry => entry.steps[1]?.kind === 'mended')).toBe(true)
      expect(cases.some(entry => entry.steps[1]?.kind === 'spoiled')).toBe(true)
    },
  )
})
