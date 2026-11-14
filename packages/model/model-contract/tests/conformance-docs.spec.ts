import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  type ConformanceHooks,
  type ConformanceObligation,
  type ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { describe, expect, it } from 'vitest'

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))

const ACKNOWLEDGE = [
  'commit-unknown-acknowledge-recovers-original',
  'forged-evidence-refused',
  'acknowledge-records-custody',
  'duplicate-acknowledge-returns-original',
  'acknowledge-conflict-on-different-input',
  'acknowledged-result-not-read-again',
  'acknowledge-and-read-serialised',
  'acknowledge-keeps-open-read-readable',
  'cleanup-failure-keeps-acknowledgement',
] as const satisfies readonly ConformanceObligation[]

const OBSERVED = [
  'new-observer-starts-from-snapshot',
  'growing-block-holds-accumulated-value',
  'sealed-block-takes-no-more-fill',
  'unsealed-tool-arguments-not-executable',
] as const satisfies readonly ConformanceObligation[]

/** For each hook and for the transport, the obligations that the suite cannot check without it. */
const SKIPPED_WITHOUT = {
  startRun: [
    'commit-unknown-acknowledge-recovers-original',
    'mixed-partial-result-readable',
    'settled-call-keeps-termination',
    'read-before-settle-refused',
    'acknowledge-refused-before-settle',
    'forged-evidence-refused',
    'acknowledge-records-custody',
    'duplicate-acknowledge-returns-original',
    'acknowledge-conflict-on-different-input',
    'acknowledged-result-not-read-again',
    'acknowledge-and-read-serialised',
    'read-page-stable-for-same-after',
    'close-read-idempotent',
    'acknowledge-keeps-open-read-readable',
    'revoked-reader-gets-no-page',
    'cleanup-failure-keeps-acknowledgement',
    'cancelled-call-ends-interrupted-unacknowledged',
    'cancel-sends-nothing-more',
    'stopping-observation-keeps-call-running',
    ...OBSERVED,
  ],
  showFacts: [...OBSERVED],
  settleCall: [
    'commit-unknown-acknowledge-recovers-original',
    'mixed-partial-result-readable',
    'settled-call-keeps-termination',
    'forged-evidence-refused',
    'acknowledge-records-custody',
    'duplicate-acknowledge-returns-original',
    'acknowledge-conflict-on-different-input',
    'acknowledged-result-not-read-again',
    'acknowledge-and-read-serialised',
    'read-page-stable-for-same-after',
    'close-read-idempotent',
    'acknowledge-keeps-open-read-readable',
    'revoked-reader-gets-no-page',
    'cleanup-failure-keeps-acknowledgement',
    'cancelled-call-ends-interrupted-unacknowledged',
  ],
  provideEvidence: [...ACKNOWLEDGE],
  failNextWrite: [
    'commit-unknown-keeps-operation',
    'commit-unknown-not-reported-as-refusal',
    'commit-unknown-cancel-recovers-original',
    'commit-unknown-acknowledge-recovers-original',
  ],
  advanceCleanup: ['acknowledge-keeps-open-read-readable'],
  blockCleanup: ['cleanup-failure-keeps-acknowledgement'],
  withdrawInstance: ['withdrawn-instance-has-no-live-route'],
  replaceInstance: ['replaced-instance-ends-observation-as-stale'],
  disconnectObservers: ['disconnect-ends-observation-as-unavailable'],
  revokeAccess: [
    'revoked-reader-gets-no-page',
    'unauthorised-cancel-denied',
    'revoked-principal-gets-denied',
    'revoked-principal-observation-ends-denied',
  ],
  failDirectory: ['directory-failure-is-unavailable'],
  transport: [
    'transport-sends-only-at-start',
    'repeated-transport-step-sends-nothing',
    'materialization-receipt-matches-request',
    'fact-stream-ends-once',
    'interruption-is-confirmed',
    'transport-close-is-idempotent',
  ],
} as const satisfies Record<(typeof HOOKS)[number] | 'transport', readonly ConformanceObligation[]>

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
  it('names, for each hook and for the transport, the obligations that the suite cannot check without it', async () => {
    for (const missing of [...HOOKS, 'transport'] as const) {
      const report = await checkModelProviderConformance({
        subject: () => without(createScriptedConformanceSubject(), missing),
        waitMs: 300,
      })
      const skipped = report.results
        .filter(result => result.status === 'not-applicable')
        .map(result => result.obligation)
      const listed = CONFORMANCE_OBLIGATIONS.filter(obligation =>
        (SKIPPED_WITHOUT[missing] as readonly ConformanceObligation[]).includes(obligation),
      )
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
