import type { LoginStateId } from '@omne-harness/legal-identity'
import type { BusinessAccessReport, LoginActivityReporter } from '@omne-harness/identity'

declare const login: LoginStateId
const operation = { owner: 'session', name: 'submit-input' } as const

// The report names the login and the operation. The caller does not pass an instant: the
// provider reads its trusted clock at receipt.
const _report: BusinessAccessReport = { login, operation }
const _withInstant: BusinessAccessReport = {
  login,
  operation,
  // @ts-expect-error the caller does not supply the time
  at: '2026-10-23T00:00:00Z',
}
const _withText: BusinessAccessReport = {
  // @ts-expect-error a login text is not a LoginStateId
  login: 'lgn_x',
  operation,
}

// A reporter answers one of the three outcomes and nothing else.
const _reporter: LoginActivityReporter = {
  report: () => Promise.resolve({ kind: 'refreshed' }),
}
const _invalid: LoginActivityReporter = {
  report: () => Promise.resolve({ kind: 'login-invalid' }),
}
const _wrong: LoginActivityReporter = {
  // @ts-expect-error a refreshed outcome is the only success; there is no allowed outcome
  report: () => Promise.resolve({ kind: 'allowed' }),
}
