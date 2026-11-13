import type { Verdict } from './cell.ts'

export type Expectation = Readonly<{ expected: Verdict; failsBecause?: string }>

export const expectations: Readonly<Record<string, Expectation>> = {
  'K-0': { expected: 'pass' },
}
