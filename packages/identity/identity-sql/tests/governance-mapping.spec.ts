// SPEC IS-10, IS-14: how the governance port maps commit results that the contract suite does not
// produce. A commit that rolls back wrote nothing and answers `basis-unavailable`; a lost reply is
// recalled by the same identity; a result that stays unknown rejects the Promise, and the create
// receipt then tells what happened. IS-14: a report never moves the idle deadline earlier.
import { afterEach, expect, it } from 'vitest'
import { IdentitySqlResultUnknown } from '../dist/result.js'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { randomIdentifiers, type IdentifierSource } from '@omne-harness/identity-sql'
import type { OrganizationId } from '@omne-harness/legal-identity'
import { encodeInstant } from '@omne-harness/utc-instant'
import { addDuration } from '../dist/deadline.js'
import { duration, openProvider, type OpenedProvider } from './fixtures/provider.ts'

const open: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of open.splice(0)) await entry.close()
})

async function provider(options: Parameters<typeof openProvider>[0] = {}) {
  const opened = await openProvider(options)
  open.push(opened)
  return opened
}

async function person(opened: OpenedProvider, name: string) {
  const credentials = { loginIdentifier: name, credential: `credential-${name}` }
  const registered = await opened.provider.operations.registerAndActivate(credentials)
  if (registered.kind !== 'succeeded') throw new Error('registration failed')
  const login = await opened.provider.operations.issueLogin(credentials)
  if (login.kind !== 'succeeded') throw new Error('issue failed')
  return { registered, login }
}

/** Commit replies are lost while `lose` is set; recall queries answer `unknown` while `silent` is. */
function lossy(storage: SqlStorage) {
  const control = { lose: false, silent: false }
  const wrapped: SqlStorage = {
    registerCombination: input => storage.registerCombination(input),
    read: (request, options) => storage.read(request, options),
    async commit(request, options) {
      const result = await storage.commit(request, options)
      return control.lose
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        : result
    },
    query: identity =>
      control.silent
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'silent' })
        : storage.query(identity),
  }
  return { control, wrap: () => wrapped }
}

it('answers basis-unavailable for a commit that rolls back, and writes no receipt', async () => {
  const real = randomIdentifiers()
  let collideWith: OrganizationId | undefined
  const identifiers: IdentifierSource = {
    account: () => real.account(),
    organization: () => collideWith ?? real.organization(),
    login: () => real.login(),
  }
  const opened = await provider({ identifiers })
  const ada = await person(opened, 'ada')
  // The new team takes Ada's personal organization identity: its first row violates the key.
  collideWith = ada.registered.organization
  const call = {
    login: ada.login.login,
    actingTenant: ada.registered.tenant,
    createCallId: 'call-1',
    name: 'Team',
    governanceModelId: 'default-team',
  }
  const refused = await opened.provider.governance.createOrganization(call)
  expect(refused).toEqual({
    kind: 'basis-unavailable',
    diagnostic: 'governance-rolled-back:sql_error',
  })
  const recall = await opened.provider.governance.queryCreateOrganization(call)
  expect(recall.kind).toBe('unknown')
  // Nothing was saved under the call id, so the same call with a free identity creates the team.
  collideWith = undefined
  expect((await opened.provider.governance.createOrganization(call)).kind).toBe('succeeded')
})

it('recalls a lost commit reply by the same identity and answers its outcome', async () => {
  let control: ReturnType<typeof lossy>['control'] | undefined
  const opened = await provider({
    wrap: storage => {
      const made = lossy(storage)
      control = made.control
      return made.wrap()
    },
  })
  if (control === undefined) throw new Error('no wrapper')
  const ada = await person(opened, 'ada')
  control.lose = true
  const created = await opened.provider.governance.createOrganization({
    login: ada.login.login,
    actingTenant: ada.registered.tenant,
    createCallId: 'call-1',
    name: 'Team',
    governanceModelId: 'default-team',
  })
  expect(created.kind).toBe('succeeded')
  control.lose = false
  const memberships = await opened.provider.governance.queryOwnMemberships({
    login: ada.login.login,
  })
  expect(memberships.kind === 'succeeded' && memberships.memberships.length).toBe(2)
})

it('rejects when the result stays unknown; the create receipt then tells the outcome', async () => {
  let control: ReturnType<typeof lossy>['control'] | undefined
  const opened = await provider({
    wrap: storage => {
      const made = lossy(storage)
      control = made.control
      return made.wrap()
    },
  })
  if (control === undefined) throw new Error('no wrapper')
  const ada = await person(opened, 'ada')
  const call = {
    login: ada.login.login,
    actingTenant: ada.registered.tenant,
    createCallId: 'call-1',
    name: 'Team',
    governanceModelId: 'default-team',
  }
  control.lose = true
  control.silent = true
  await expect(opened.provider.governance.createOrganization(call)).rejects.toBeInstanceOf(
    IdentitySqlResultUnknown,
  )
  control.lose = false
  control.silent = false
  const recalled = await opened.provider.governance.queryCreateOrganization(call)
  expect(recalled.kind).toBe('succeeded')
})

it('keeps the later idle deadline when a report computes an earlier one', async () => {
  const first = await provider()
  const ada = await person(first, 'ada')
  first.clock.advanceBy(duration('PT1800S'))
  const later = await first.provider.governance.reportBusinessAccess({ login: ada.login.login })
  if (later.kind !== 'refreshed') throw new Error(`report ${later.kind}`)
  // A second instance over the same records, whose clock reads earlier: it has adopted nothing.
  const second = await provider({ storage: first.storage })
  second.clock.setTo(first.clock.current())
  second.clock.advanceBy(duration('-PT1200S'))
  const earlier = await second.provider.governance.reportBusinessAccess({ login: ada.login.login })
  if (earlier.kind !== 'refreshed') throw new Error(`report ${earlier.kind}`)
  // `Instant` keeps its fields private, so the encoded texts are compared.
  const expected = addDuration(first.clock.current(), duration('PT3600S'))
  if (expected === undefined) throw new Error('fixture deadline')
  expect(encodeInstant(later.idleDeadline)).toBe(encodeInstant(expected))
  expect(encodeInstant(earlier.idleDeadline)).toBe(encodeInstant(expected))
})
