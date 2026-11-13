import {
  DEFAULT_LIMITS,
  type HygieneBaseline,
  type HygieneLimits,
} from '../../../src/hygiene/baseline.ts'
import { measure, type TextFile } from '../../../src/hygiene/measure.ts'

export const emptyBaseline = (overrides: Partial<HygieneBaseline> = {}): HygieneBaseline => ({
  limits: DEFAULT_LIMITS,
  documents: [],
  comments: {},
  sizes: { files: {}, functions: {} },
  ...overrides,
})

export const measured = (
  options: {
    documents?: readonly string[]
    sources?: readonly TextFile[]
    limits?: HygieneLimits
    privateMembers?: readonly string[]
  } = {},
) =>
  measure(
    options.documents ?? [],
    directory => options.privateMembers?.includes(directory) ?? false,
    options.sources ?? [],
    options.limits ?? DEFAULT_LIMITS,
  )

export const SOURCE = 'packages/group/member/src/index.ts'

export const repeat = (line: string, times: number): string =>
  Array.from({ length: times }, () => line).join('\n')

export const longFunction = (name: string, lines: number): string =>
  `export function ${name}(): number {\n${repeat('  void 0', lines - 3)}\n  return 1\n}\n`
