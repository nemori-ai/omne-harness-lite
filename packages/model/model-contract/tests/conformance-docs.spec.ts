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

const SETTLED_CONTACT = [
  'contact-on-unacknowledged-result-claims-no-run',
  'contact-on-acknowledged-result-is-settled',
] as const satisfies readonly ConformanceObligation[]

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
    ...SETTLED_CONTACT,
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
    ...SETTLED_CONTACT,
  ],
  provideEvidence: [...ACKNOWLEDGE, 'contact-on-acknowledged-result-is-settled'],
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
  live: [
    'live-command-before-open-refused',
    'live-command-taken-once',
    'live-command-outside-profile-refused',
    'live-command-after-settle-refused',
    'live-end-before-open-refused',
    'live-end-durable-and-idempotent',
    'live-end-after-settle-idempotent',
    'live-media-by-phase-and-modality',
    'live-call-of-another-tenant-unknown',
    'live-lost-body-unavailable',
  ],
} as const satisfies Record<
  (typeof HOOKS)[number] | 'transport' | 'live',
  readonly ConformanceObligation[]
>

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
  hook: (typeof HOOKS)[number] | 'transport' | 'live',
): ConformanceSubject<ScriptedPrincipal> {
  if (hook === 'transport') {
    const { transport: _, ...rest } = subject
    return rest
  }
  if (hook === 'live') {
    const { live: _, ...rest } = subject
    return rest
  }
  const hooks = { ...subject.hooks }
  delete hooks[hook]
  return { ...subject, hooks }
}

describe('the obligations each part of the subject carries', () => {
  it('names, for each hook, the transport and the live calls, the obligations that the suite cannot check without it', async () => {
    for (const missing of [...HOOKS, 'transport', 'live'] as const) {
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
