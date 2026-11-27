import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { syntaxImports, syntaxOf } from '@omne-harness/repo-toolchain/core/syntax'

const MEMBERS: Readonly<Record<string, readonly string[]>> = {
  'benchmarks/': ['@omne-harness/perf-harness', 'vitest', 'vitest/config'],
  'tools/perf-harness/': ['vitest', 'vitest/config'],
}

function refused(file: SourceFile, member: string, specifier: string): string | null {
  if (specifier.startsWith('node:')) return null
  const resolved = file.resolvedModules?.[specifier]
  const target =
    resolved ??
    (specifier.startsWith('.') ? normalize(join(dirname(file.path), specifier)) : specifier)
  if (specifier.startsWith('.'))
    return target.startsWith(member) || target === 'vitest.tiers.mts'
      ? null
      : `reaches outside ${member} to ${target}`
  return MEMBERS[member]?.includes(specifier) === true ? null : `imports ${specifier}`
}

export const evaluationNotProductSource: Rule = {
  id: 'evaluation-not-product-source',
  source: 'benchmarks/SPEC.md: 原则与约束; tools/perf-harness/SPEC.md: 原则与约束',
  description:
    'the suites drive the product through its lab server and its command line and import none of its source; the facility imports neither the product nor the suites',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      const member = Object.keys(MEMBERS).find(prefix => file.path.startsWith(prefix))
      if (member === undefined) continue
      for (const ref of syntaxImports(syntaxOf(file))) {
        if (ref.specifier === undefined) continue
        const reason = refused(file, member, ref.specifier)
        if (reason !== null)
          violations.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, ref.index),
            message: `${reason}: an evaluation changes nothing of what it measures and reads none of its source`,
          })
      }
    }
    return violations
  },
}
