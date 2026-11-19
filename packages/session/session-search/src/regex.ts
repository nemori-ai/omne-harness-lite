import { RE2JS } from 're2js'
import { ANY, and, or, planLiteral, type GramPlan, type PlanLimits } from './plan.ts'

// The only file that knows the regular expression engine. RE2 syntax, linear time in the text:
// no backreferences, no lookaround.

export type Span = Readonly<{ start: number; end: number }>
export type RegexRefusal = 'pattern-invalid' | 'pattern-too-large'
export type CompiledRegex = Readonly<{
  plan: GramPlan
  find(text: string): Span | null
}>

type Prefilter = Readonly<{ type?: unknown; str?: unknown; subs?: unknown }>
const LITERAL = 1
const ALL_OF = 2
const ONE_OF = 3

// The required literals of a pattern, as the engine worked them out. It is an internal field of
// the engine: whatever does not have the known shape narrows nothing, which is slower, never wrong.
function planOf(node: unknown, limits: PlanLimits): GramPlan {
  if (typeof node !== 'object' || node === null) return ANY
  const { type, str, subs } = node as Prefilter
  if (type === LITERAL) return typeof str === 'string' ? planLiteral(str, limits) : ANY
  if (!Array.isArray(subs)) return ANY
  const parts = subs.map(sub => planOf(sub, limits))
  if (type === ALL_OF) return and(parts)
  return type === ONE_OF ? or(parts, limits) : ANY
}

function prefilterOf(pattern: string): unknown {
  // Case-sensitive on purpose: the engine gives no literals for a case-insensitive pattern, and
  // the folded literals of the sensitive one are required of the folded text either way.
  const compiled = RE2JS.compile(pattern) as unknown as { re2Input?: { prefilter?: unknown } }
  return compiled.re2Input?.prefilter
}

function programSize(compiled: unknown): number {
  const inst = (compiled as { re2Input?: { prog?: { inst?: unknown } } }).re2Input?.prog?.inst
  return Array.isArray(inst) ? inst.length : 0
}

export function compileRegex(
  input: Readonly<{ pattern: string; caseSensitive: boolean }>,
  limits: PlanLimits & Readonly<{ maxProgramSize: number }>,
): CompiledRegex | RegexRefusal {
  let compiled: RE2JS
  let plan: GramPlan
  try {
    compiled = RE2JS.compile(input.pattern, input.caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE)
    plan = planOf(prefilterOf(input.pattern), limits)
  } catch {
    return 'pattern-invalid'
  }
  if (programSize(compiled) > limits.maxProgramSize) return 'pattern-too-large'
  return {
    plan,
    find(text) {
      const matcher = compiled.matcher(text)
      return matcher.find() ? { start: matcher.start(), end: matcher.end() } : null
    },
  }
}
