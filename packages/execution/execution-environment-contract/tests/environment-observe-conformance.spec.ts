import { expect, it } from 'vitest'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  Access,
  EnvironmentProvider,
  ExecutionEnvironment,
  LookupUnknown,
  ProviderAcquireInput,
  ProviderRegistrations,
  Rejected,
  RetainedProcessInformation,
} from '@omne-harness/execution-environment-contract'
import {
  executionEnvironmentConformance,
  runConformanceCase,
  type EnvironmentConformancePorts,
  type EnvironmentConformanceSubject,
} from '@omne-harness/execution-environment-contract/testing'

// The two V-EE32 cases of the public execution-environment suite, run on a controlled environment
// that implements only `registerProvider` and `observeRetained`. The registry runs them for real in
// its own member; here each violation shows that the case refuses an environment that breaks it.

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('invalid tenant fixture')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const otherTenant = tenantOf('acc_zzzzzzzzzzzzzzzzzzzzzzzzzz')
const access: Access<string> = { principal: 'observer', tenant }
const otherAccess: Access<string> = { principal: 'other-observer', tenant: otherTenant }
function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}
function scopeOf(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

const violations = {
  'asks-no-authority': 'lists without asking the environment authority',
  'maps-unavailable-authority-to-refusal':
    'answers notAuthorized when the authority is unavailable',
  'checks-no-binding': 'lists a scope without checking its binding',
  'ignores-the-bound-tenant': 'lists a scope bound to another tenant',
  'accepts-an-unminted-tenant': 'takes a tenant it did not mint as an authorization question',
  'refuses-an-unknown-binding': 'answers notAuthorized when the binding is unknown',
  'reads-providers-on-refusal': 'reads its providers for an observation it refuses',
  'asks-for-another-tenant': 'asks the providers for a tenant other than the caller',
  'asks-for-another-scope': 'asks the providers for a scope other than the observed one',
  'lists-nothing': 'answers an empty list without reading its providers',
  'keeps-duplicates': 'lists a process twice when two providers hold it',
  'gives-a-partial-list': 'gives a partial list when one provider is unavailable',
  'fails-without-observation': 'answers unavailable for a provider that offers no observation',
  'acquires-while-observing': 'allocates an acquisition while it observes',
} as const
type Violation = keyof typeof violations

/** A payload outside the operation's type, as a caller outside TypeScript can send it. */
function malformed<T>(payload: unknown): T {
  return payload as T
}
const rejected = (reason: Rejected['reason']): Rejected => ({ kind: 'rejected', reason })
const unknown = (cause: LookupUnknown['cause']): LookupUnknown => ({ kind: 'unknown', cause })

/**
 * Observes with the suite's ports as the contract asks: the minted tenant, the authority for
 * `observe-retained`, then the trusted binding of the scope to the caller's tenant; then one full
 * read of every provider, merged by reference, and `unavailable` when one provider cannot answer.
 * A violation breaks exactly one of these steps.
 */
function controlledEnvironment(
  ports: EnvironmentConformancePorts<string>,
  violation?: Violation,
): ExecutionEnvironment<string> & ProviderRegistrations {
  const providers = new Set<EnvironmentProvider>()
  const outside = (operation: string) => () => {
    throw new Error(`${operation} is outside the controlled environment`)
  }

  async function refusal(
    caller: Access<string>,
    scope: ScopeRef,
  ): Promise<Rejected | LookupUnknown | undefined> {
    if (violation !== 'asks-no-authority') {
      const decision = await ports.authority.authorize(caller, { kind: 'observe-retained', scope })
      switch (decision.kind) {
        case 'authorized':
          break
        case 'refused':
          return rejected('notAuthorized')
        case 'unavailable':
          return rejected(
            violation === 'maps-unavailable-authority-to-refusal' ? 'notAuthorized' : 'unavailable',
          )
        case 'unknown':
          return unknown('authority')
        default: {
          const exhaustive: never = decision
          return exhaustive
        }
      }
    }
    if (violation === 'checks-no-binding') return undefined
    const binding = await ports.bindings.lookup(scope)
    switch (binding.kind) {
      case 'bound':
        return violation === 'ignores-the-bound-tenant' ||
          tenantEquals(binding.tenant, caller.tenant)
          ? undefined
          : rejected('notAuthorized')
      case 'unbound':
        return rejected('notAuthorized')
      case 'unavailable':
        return rejected('unavailable')
      case 'unknown':
        return violation === 'refuses-an-unknown-binding'
          ? rejected('notAuthorized')
          : unknown('scope-binding')
      default: {
        const exhaustive: never = binding
        return exhaustive
      }
    }
  }

  async function read(
    caller: Access<string>,
    scope: ScopeRef,
  ): Promise<readonly RetainedProcessInformation[] | Rejected> {
    if (violation === 'lists-nothing') return []
    const asked = violation === 'asks-for-another-scope' ? scopeOf(`${scope.ref}-elsewhere`) : scope
    const who = violation === 'asks-for-another-tenant' ? otherTenant : caller.tenant
    const answers = await Promise.all(
      [...providers].map(provider =>
        provider.retainedProcesses
          ? provider.retainedProcesses(asked, who)
          : violation === 'fails-without-observation'
            ? 'unavailable'
            : [],
      ),
    )
    const items = new Map<string, RetainedProcessInformation>()
    for (const answer of answers) {
      if (answer === 'unavailable') {
        if (violation === 'gives-a-partial-list') continue
        return rejected('unavailable')
      }
      for (const item of answer) {
        const key = JSON.stringify([item.process.id, item.process.generation])
        items.set(violation === 'keeps-duplicates' ? `${items.size}:${key}` : key, item)
      }
    }
    return [...items.values()]
  }

  return {
    registerProvider(provider) {
      providers.add(provider)
      return async () => {
        providers.delete(provider)
      }
    },
    async observeRetained(caller, scope) {
      if (violation !== 'accepts-an-unminted-tenant' && !tenantEquals(caller.tenant, caller.tenant))
        return rejected('invalidInput')
      const refused = await refusal(caller, scope)
      if (refused !== undefined) {
        if (violation === 'reads-providers-on-refusal') await read(caller, scope)
        return refused
      }
      if (violation === 'acquires-while-observing')
        for (const provider of providers)
          await provider.acquire(malformed<ProviderAcquireInput>({})).catch(() => undefined)
      return read(caller, scope)
    },
    registerFacility: outside('registerFacility'),
    resolvePlacement: outside('resolvePlacement'),
    acquire: outside('acquire'),
    inspectAcquisition: outside('inspectAcquisition'),
    inspectRecoveryAcquisition: outside('inspectRecoveryAcquisition'),
    describe: outside('describe'),
    recoverOwned: outside('recoverOwned'),
    releaseScope: outside('releaseScope'),
  }
}

const asks = 'V-EE32.observe-asks-authority-and-binding'
const complete = 'V-EE32.observe-is-complete-or-unavailable'

function caseNamed(
  name: string,
  violation?: Violation,
  shape: Partial<EnvironmentConformanceSubject<string>> = { otherAccess },
) {
  const test = executionEnvironmentConformance<string>({
    subject: ports => ({
      environment: controlledEnvironment(ports, violation),
      access,
      scope: scopeOf('observed-scope'),
      ...shape,
    }),
  }).find(test => test.name === name)
  if (!test) throw new Error(`missing conformance case ${name}`)
  return test
}

/** Node puts the actual and expected values after the message of a failed assertion. */
const assertionMessage = (message: string) =>
  expect.stringMatching(new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\n|$)`))

for (const name of [asks, complete])
  it(`${name} accepts a controlled environment`, async () => {
    expect(await runConformanceCase(caseNamed(name))).toEqual({ name, status: 'pass' })
  })

it(`${asks} accepts a controlled environment given no access of another tenant`, async () => {
  expect(await runConformanceCase(caseNamed(asks, undefined, {}))).toEqual({
    name: asks,
    status: 'pass',
  })
})

const denials: readonly (readonly [string, Violation, string])[] = [
  [
    asks,
    'asks-no-authority',
    'the environment authority is asked for observe-retained on the scope',
  ],
  [
    asks,
    'maps-unavailable-authority-to-refusal',
    'the authority answer maps to the observation answer',
  ],
  [asks, 'checks-no-binding', 'an unbound scope is not authorized'],
  [asks, 'ignores-the-bound-tenant', 'a scope bound to another tenant is not authorized'],
  [asks, 'accepts-an-unminted-tenant', 'an unminted tenant is invalid input'],
  [asks, 'refuses-an-unknown-binding', 'an unknown binding leaves the observation unknown'],
  [asks, 'reads-providers-on-refusal', 'a refused observation reads no provider'],
  [asks, 'asks-for-another-tenant', 'and for the tenant of the access'],
  [asks, 'asks-for-another-scope', 'the provider is asked for the observed scope'],
  [asks, 'lists-nothing', 'the observation lists what the provider holds'],
  [asks, 'acquires-while-observing', 'an observation allocates nothing'],
  [complete, 'keeps-duplicates', 'a retained process listed by two providers appears once'],
  [
    complete,
    'gives-a-partial-list',
    'one provider that cannot answer makes the whole answer unavailable, never a partial list',
  ],
  [complete, 'fails-without-observation', 'every provider answered, so the observation is a list'],
  [complete, 'acquires-while-observing', 'an observation allocates nothing'],
]
for (const [name, violation, message] of denials)
  it(`${name} denies an environment that ${violations[violation]}`, async () => {
    await expect(runConformanceCase(caseNamed(name, violation))).rejects.toMatchObject({
      name: 'AssertionError',
      message: assertionMessage(message),
    })
  })
