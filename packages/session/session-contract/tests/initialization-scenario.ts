import {
  decide,
  reduce,
  initializationRegistrationCommit,
  type CommittedBatch,
  type SessionCommand,
  type InitializationGuardResult,
  type InitializationGuardFacts,
  type SessionCreation,
  type InitializationResult,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
  createMemoryInitializationSource,
  createMemorySessionTransactions,
  creation,
  memoryAccess,
  operationId,
  succeeded,
  evidence,
  adoption,
} from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'

export type InitCommand = Extract<SessionCommand, { kind: 'create' | 'completeInitialization' }>
export const material = (name: string) => ({
  schema: adoption(name),
  value: { kind: 'string' as const, value: name },
})
export const ready = (owner: string, item: string): InitializationResult => ({
  owner,
  item,
  result: { kind: 'ready', evidence: evidence(`ready/${owner}/${item}`) },
})
export const failed = (
  owner: string,
  item: string,
  diagnostic = 'retry loader',
): InitializationResult => ({
  owner,
  item,
  result: { kind: 'failed', diagnostic, recovery: evidence(`recovery/${owner}/${item}`) },
})
export const registrationSource = (item: string) => ({
  kind: 'context-registration' as const,
  owner: 'context',
  item,
  protocol: adoption('registration-translation'),
  input: {
    need: material(`need/${item}`),
    binding: material(`binding/${item}`),
    parameters: material(`parameters/${item}`),
  },
})

export function rows(
  command: InitCommand,
  facts: InitializationGuardFacts,
  previous: WorkSnapshot | null = null,
): CommittedBatch {
  const decision = decide(previous, command, [initializationFixtureGuard(facts)], null, {
    compaction: null,
  })
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(Number(previous?.revision ?? '0') + 1) as CommittedBatch['revision']
  return {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      id: `${revision}/${index}` as CommittedBatch['entries'][number]['id'],
      revision,
    })),
  }
}

export function initializationScenario(value: Partial<SessionCreation> = {}) {
  const access = memoryAccess('tester')
  const base = { tenant: access.tenant, session: access.session }
  const source = createMemoryInitializationSource()
  const port = createMemorySessionTransactions<string>({ initialization: source })
  const command: Extract<InitCommand, { kind: 'create' }> = {
    kind: 'create',
    input: { ...base, operation: operationId('create'), creation: creation(value) },
  }
  const facts = (
    input: InitCommand = command,
    previous: WorkSnapshot | null = null,
    results?: readonly InitializationGuardResult[],
  ) =>
    initializationFixtureFacts(
      input,
      previous,
      input.kind === 'create' ? adoptedInitializationFixture(input) : null,
      results,
    )
  const prepare = async (input: InitCommand, material = facts(input)) => {
    source.controls.register(input, initializationFixtureGuard(material))
    return succeeded(await source.prepare(input), 'source preparation')
  }
  const read = async () => succeeded(await port.readWork(access), 'snapshot')
  const history = async () =>
    succeeded(
      await port.history.begin({
        ...access,
        kinds: [],
        from: null,
        direction: 'forward',
        pageBytes: 1_000_000,
      }),
      'history',
    ).entries
  const complete = (
    result: InitializationResult,
    operation = `complete-${result.item}`,
  ): Extract<InitCommand, { kind: 'completeInitialization' }> => ({
    kind: 'completeInitialization',
    input: { ...base, operation: operationId(operation), result },
  })
  const create = async (initial = facts()) =>
    succeeded(await port.commit({ command, guards: await prepare(command, initial) }), 'create')
  const preview = () => {
    const withoutResults: typeof command = {
      ...command,
      input: {
        ...command.input,
        creation: {
          ...command.input.creation,
          initialization: {
            sources: command.input.creation.initialization?.sources ?? [],
            results: [],
          },
        },
      },
    }
    const result = reduce(null, rows(withoutResults, facts(withoutResults)))
    if (result.kind !== 'reduced') throw new Error(result.diagnostic)
    return result.snapshot
  }
  const registration = (
    item: string,
    basedOn: number,
    previous = preview(),
  ): InitializationGuardResult => {
    const scope = previous.contextScopes?.[0]
    const original = command.input.creation.initialization?.sources.find(
      source => source.item === item,
    )
    const tenant = tenantCodec.encode(access.tenant)
    if (scope === undefined || original?.kind !== 'context-registration' || !tenant.ok)
      throw new Error('missing original registration')
    return {
      owner: original.owner,
      item,
      result: ready(original.owner, item),
      consequence: {
        kind: 'context-registration',
        prepared: evidence(`prepared/${item}/${basedOn}`),
        decision: {
          scope: scope.scope,
          tenant: tenant.value,
          key: `block/${item}`,
          commit: initializationRegistrationCommit({
            ...base,
            createOperation: command.input.operation,
            owner: original.owner,
            item,
          }),
          basedOn,
          revision: basedOn + 1,
          creating: true,
          required: true,
          ...original.input,
        },
      },
    }
  }
  return {
    access,
    base,
    source,
    port,
    command,
    facts,
    prepare,
    read,
    history,
    complete,
    create,
    preview,
    registration,
  }
}
