import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { combinationManifest } from '@omne-harness/sql-contract'
import { GovernanceContributionRefSchema } from '@omne-harness/governance-contract'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { recordSchema, type AcceptOperation } from '../src/operation-schema.ts'
import { METADATA_PLANNER, MUTATION_PLANNER, ADOPTION_PLANNER } from '../src/activation-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { digest, json, operationIdentity, definitionKey } from '../src/encoding.ts'
import { command, binding, scope } from './operation-world.ts'
import { adoption, target } from './adoption-world.ts'
import { declaration } from './definition-fixture.ts'
import { activationCatalog, openActivation, plannerMembers } from './activation-world.ts'

const worlds: Awaited<ReturnType<typeof openActivation>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function open() {
  const w = await openActivation()
  worlds.push(w)
  await w.control({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  return w
}
async function prepare(
  w: Awaited<ReturnType<typeof openActivation>>,
  input: AcceptOperation,
  mode: 'mutation' | 'adoption' = 'mutation',
) {
  await w.control({ kind: 'accept', input })
  const operation = binding(input)
  const custody = standingCustodySchema.parse(
    await w.control({
      kind: 'standing-prepare',
      input: { operation, destination: 'governance', required: [] },
    }),
  )
  const reservation = { ...custody.request, id: custody.reservationId }
  await w.control({ kind: 'standing-held', binding: operation, reservation })
  const request = { binding: operation, execution: w.execution(mode) }
  await w.control({ kind: 'submit', ...request })
  return { request, reservation }
}
const found = z.object({ kind: z.literal('found'), record: recordSchema })

it('registers exclusive production plans and rejects two producers or missing current facts', () => {
  const catalog = activationCatalog()
  for (const participants of Object.values(plannerMembers))
    expect(combinationManifest({ catalog, participants }).kind).toBe('manifest')
  for (const participants of [
    [GOVERNANCE_OWNER],
    [GOVERNANCE_OWNER, ADOPTION_PLANNER],
    [GOVERNANCE_OWNER, METADATA_PLANNER, MUTATION_PLANNER],
  ])
    expect(combinationManifest({ catalog, participants }).kind).not.toBe('manifest')
  const planners = catalog.participants.filter(p =>
    [METADATA_PLANNER, MUTATION_PLANNER, ADOPTION_PLANNER].includes(p.participant),
  )
  expect(planners.every(p => p.ownedTables.length === 0)).toBe(true)
})
it('executes contribution and withdrawal through the production writer and recognizes original receipts', async () => {
  const w = await open(),
    input = command()
  const { request } = await prepare(w, input)
  const committed = found.parse(await w.apply('mutation', request)).record
  expect(committed).toMatchObject({
    state: 'committed',
    result: { kind: 'registered', declarationRevision: 1 },
  })
  const contribution = z
    .object({ contribution: GovernanceContributionRefSchema })
    .parse(committed.result).contribution
  const withdraw: AcceptOperation = {
    ...input,
    request: { owner: 'withdraw', command: { operationId: 'release', contribution } },
  }
  const prepared = await prepare(w, withdraw)
  expect(await w.apply('mutation', prepared.request)).toMatchObject({
    record: { state: 'committed', result: { kind: 'released' } },
  })
  const observed = await w.response(
    await w.commit('mutation', w.businessCommands('mutation', request)),
  )
  expect(observed).toEqual({ kind: 'found', record: committed })
  expect(
    await w.storage.query(operationIdentity(w.domain.transactionDomain, request.binding.ref)),
  ).toMatchObject({ kind: 'committed' })
})
it('requires the selected planner to execute and binds the writer to the exact request', async () => {
  const w = await open(),
    request = { kind: 'accept' as const, input: command() }
  const commands = w.controlCommands(request)
  expect(
    await w.commit(
      'metadata',
      commands.filter(c => c.participant === GOVERNANCE_OWNER),
    ),
  ).toMatchObject({ kind: 'rejected_before_accept', reason: 'participant_dependency_missing' })
  expect(
    await w.commit(
      'metadata',
      commands.map(c =>
        c.participant === GOVERNANCE_OWNER ? { ...c, facts: { requestDigest: 'b'.repeat(64) } } : c,
      ),
    ),
  ).toMatchObject({ kind: 'rolled_back' })
  expect(await w.control({ kind: 'seal', binding: binding(request.input) })).toEqual({
    kind: 'absent',
  })
  expect(await w.control(request)).toMatchObject({ record: { state: 'accepted' } })
})
it('does not route adoption through metadata or mutation planners', async () => {
  const w = await open(),
    { input } = adoption([], 'adopt', 0)
  const { request } = await prepare(w, input, 'adoption')
  const forged = { kind: 'apply', ...request }
  expect(
    await w.commit('metadata', [
      { participant: METADATA_PLANNER, facts: { request: json(forged) } },
      { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(forged) } },
    ]),
  ).toMatchObject({ kind: 'rolled_back' })
  expect(await w.commit('mutation', w.businessCommands('mutation', request))).toMatchObject({
    kind: 'rolled_back',
  })
  expect(await w.control({ kind: 'seal', binding: request.binding })).toMatchObject({
    record: { state: 'aborted' },
  })
})
it('adopts only evidence supplied through the selected current fact producer', async () => {
  const w = await open(),
    { input, evidence } = adoption([], 'adopt', 0)
  const { request } = await prepare(w, input, 'adoption')
  const commands = w.businessCommands('adoption', request, json(evidence))
  expect(
    await w.commit(
      'adoption',
      commands.filter(c => c.participant !== 'fixture.governance-current'),
    ),
  ).toMatchObject({ kind: 'rejected_before_accept', reason: 'participant_dependency_missing' })
  const forged = { ...request, evidence }
  expect(
    await w.commit(
      'adoption',
      commands.map(c =>
        c.participant === ADOPTION_PLANNER ? { ...c, facts: { request: json(forged) } } : c,
      ),
    ),
  ).toMatchObject({ kind: 'rolled_back' })
  expect(await w.apply('adoption', request, json(evidence))).toMatchObject({
    record: { state: 'committed', result: { kind: 'adopted', basis: { adoptionRevision: 1 } } },
  })
})
it('rejects a current fact for another original operation without publishing a selection', async () => {
  const w = await open(),
    { input, evidence } = adoption([], 'adopt', 0)
  const { request } = await prepare(w, input, 'adoption')
  evidence.binding.requestDigest = 'b'.repeat(64)
  expect(await w.apply('adoption', request, json(evidence))).toMatchObject({
    record: { state: 'aborted', result: { kind: 'unavailable', owner: 'adoption-current' } },
  })
  const next = adoption([], 'next', 0)
  const pending = await prepare(w, next.input, 'adoption')
  expect(await w.apply('adoption', pending.request, json(next.evidence))).toMatchObject({
    record: { state: 'committed', result: { basis: { adoptionRevision: 1 } } },
  })
})
it('seals and records settlement using metadata alone while later mutation recognizes the terminal', async () => {
  const w = await open(),
    { request, reservation } = await prepare(w, command())
  expect(
    await w.control({
      kind: 'standing-seal',
      reservation,
      route: { destination: 'governance', transactionDomain: w.domain.transactionDomain },
    }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(
    await w.control({
      kind: 'standing-settled',
      binding: request.binding,
      reservation,
      outcome: 'aborted',
    }),
  ).toMatchObject({ kind: 'settled' })
  expect(await w.apply('mutation', request)).toMatchObject({ record: { state: 'aborted' } })
})

it('rejects a current producer body that schema normalization would silently change', async () => {
  const w = await open(),
    input = command('register-target'),
    value = declaration()
  if (input.request.owner !== 'contribute') throw new Error('fixture request')
  input.request.command.declaration = value
  const registration = await prepare(w, input)
  const record = found.parse(await w.apply('mutation', registration.request)).record
  const contribution = z
    .object({ contribution: GovernanceContributionRefSchema })
    .parse(record.result).contribution
  const candidate = {
    contribution,
    declaration: value,
    definitionKey: definitionKey(value.reference),
  }
  const selected = adoption([{ candidate, targets: [target('one')] }], 'adopt-target', 1)
  const pending = await prepare(w, selected.input, 'adoption')
  const item = selected.evidence.targets[0]?.definition.items[0]
  if (!item) throw new Error('fixture setting item')
  item.presentation.title = ' ' + item.presentation.title + ' '
  expect(
    await w.commit(
      'adoption',
      w.businessCommands('adoption', pending.request, json(selected.evidence)),
    ),
  ).toMatchObject({ kind: 'rolled_back' })
})
