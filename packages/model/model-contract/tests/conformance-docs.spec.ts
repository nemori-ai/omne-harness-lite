import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  type ConformanceHooks,
  type ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { describe, expect, it } from 'vitest'

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))
const page = readFileSync(here('../docs/public-api.md'), 'utf8')

type Row = Readonly<{ obligation: string; needs: readonly string[]; partial: boolean }>

/** The rows of the obligation table on the page: the name, and the hooks that the row lists. */
function rows(): Row[] {
  const table = page.slice(page.indexOf('## 符合性断言'))
  return table
    .split('\n')
    .filter(line => line.startsWith('| `'))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim())
      const hooks = cells[4] ?? ''
      return {
        obligation: /^`([a-z-]+)`$/u.exec(cells[1] ?? '')?.[1] ?? '',
        needs: [...hooks.matchAll(/`([A-Za-z]+)`|传输/gu)].map(item => item[1] ?? 'transport'),
        partial: hooks.includes('只检查'),
      }
    })
}

const HOOKS = [
  'startRun',
  'showFacts',
  'settleCall',
  'provideEvidence',
  'failNextWrite',
  'advanceCleanup',
  'blockCleanup',
  'withdrawInstance',
  'replaceInstance',
  'disconnectObservers',
  'revokeAccess',
  'failDirectory',
] as const satisfies readonly (keyof ConformanceHooks<ScriptedPrincipal>)[]

function without(
  subject: ConformanceSubject<ScriptedPrincipal>,
  hook: (typeof HOOKS)[number] | 'transport',
): ConformanceSubject<ScriptedPrincipal> {
  if (hook === 'transport') {
    return {
      provider: subject.provider,
      principal: subject.principal,
      tenant: subject.tenant,
      otherTenant: subject.otherTenant,
      hooks: { ...subject.hooks },
    }
  }
  const hooks = { ...subject.hooks }
  delete hooks[hook]
  return { ...subject, hooks }
}

describe('the obligation table of docs/public-api.md', () => {
  it('lists the obligations that the suite checks, in the order of the report', () => {
    expect(rows().map(row => row.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  })

  it('names, for each hook and for the transport, the obligations that the suite cannot check without it', async () => {
    for (const missing of [...HOOKS, 'transport'] as const) {
      const report = await checkModelProviderConformance({
        subject: () => without(createScriptedConformanceSubject(), missing),
        waitMs: 300,
      })
      const skipped = report.results
        .filter(result => result.status === 'not-applicable')
        .map(result => result.obligation)
      const listed = rows()
        .filter(row => row.needs.includes(missing) && !row.partial)
        .map(row => row.obligation)
      expect({ missing, skipped }).toEqual({ missing, skipped: listed })
    }
  })
})

describe('the tests that break one obligation at a time', () => {
  it('give every obligation a provider that the suite fails for it', () => {
    const covered = new Set<string>()
    for (const file of readdirSync(here('.')).filter(name =>
      /^conformance-.*\.spec\.ts$/u.test(name),
    ))
      for (const match of readFileSync(here(file), 'utf8').matchAll(
        /expect\(failing\)\.toEqual\(\[([^\]]*)\]\)/gu,
      ))
        for (const name of (match[1] ?? '').matchAll(/'([a-z-]+)'/gu)) covered.add(name[1] ?? '')
    expect([...CONFORMANCE_OBLIGATIONS].filter(name => !covered.has(name))).toEqual([])
  })
})
