import type {
  Adoption,
  FixedModelRequest,
  MaterializationReceipt,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  IndependentModelFact,
  MaterializedTransport,
  ModelTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sameAdoption } from './adoption.ts'

type Terminal = Extract<IndependentModelFact, { kind: 'ended' | 'not-started' }>

function copyAdoption(adoption: Adoption): Adoption {
  return {
    owner: adoption.owner,
    name: adoption.name,
    revision: adoption.revision,
    digest: adoption.digest,
  }
}

function copyReceipt(receipt: MaterializationReceipt): MaterializationReceipt {
  const { replayFormat } = receipt
  return {
    supplier: copyAdoption(receipt.supplier),
    representation: copyAdoption(receipt.representation),
    payloadDigest: receipt.payloadDigest,
    ...(replayFormat === undefined ? {} : { replayFormat }),
  }
}

function receiptMatches(
  materialized: MaterializedTransport,
  expected: Pick<MaterializationReceipt, 'supplier' | 'representation'>,
): boolean {
  const first = copyReceipt(materialized.receipt)
  const second = copyReceipt(materialized.receipt)
  return (
    first.payloadDigest.length > 0 &&
    first.payloadDigest === second.payloadDigest &&
    first.replayFormat === second.replayFormat &&
    sameAdoption(first.supplier, expected.supplier) &&
    sameAdoption(first.representation, expected.representation) &&
    sameAdoption(first.supplier, second.supplier) &&
    sameAdoption(first.representation, second.representation)
  )
}

async function preparation<T>(
  action: () => Outcome<T, TransportFailure> | Promise<Outcome<T, TransportFailure>>,
  phase: 'prepare' | 'materialize' | 'receipt',
): Promise<Outcome<T, TransportFailure>> {
  try {
    const outcome = await action()
    return 'ok' in outcome ? succeed(outcome.ok) : fail(outcome.failure)
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: 'model-transport',
      diagnostic: `independent-${phase}-failed`,
    })
  }
}

function streamLost(phase: 'start' | 'read' | 'eof'): Extract<Terminal, { kind: 'ended' }> {
  return {
    kind: 'ended',
    termination: {
      kind: 'failed',
      fault: {
        cause: 'stream-lost',
        upstreamStatus: null,
        diagnostic: `independent-${phase}-failed`,
      },
    },
  }
}

async function closeResources(actions: readonly (() => unknown)[]): Promise<void> {
  let failure: Error | null = null
  for (const action of actions) {
    try {
      await action()
    } catch {
      failure ??= new Error('independent-cleanup-failed')
    }
  }
  if (failure !== null) throw failure
}

async function readFact(
  source: AsyncIterator<TransportFact>,
): Promise<
  | { kind: 'ended'; value: Extract<TransportFact, { kind: 'ended' }> }
  | { kind: 'fact'; value: Exclude<TransportFact, { kind: 'ended' }> }
> {
  try {
    const step = await source.next()
    if (step.done) return { kind: 'ended', value: streamLost('eof') }
    const value = step.value
    return value.kind === 'ended' ? { kind: 'ended', value } : { kind: 'fact', value }
  } catch {
    return { kind: 'ended', value: streamLost('read') }
  }
}

async function* execute(
  request: FixedModelRequest,
  transport: ModelTransport,
  signal: AbortSignal,
): AsyncGenerator<IndependentModelFact, void, unknown> {
  const supplier = request.suppliers[0]
  const expected = {
    supplier: copyAdoption(supplier.adoption),
    representation: copyAdoption(request.representation),
  }
  let prepared: PreparedTransport | undefined
  let materialized: MaterializedTransport | undefined
  let source: AsyncIterator<TransportFact> | undefined
  let cleanup: Promise<void> | undefined
  const close = () =>
    (cleanup ??= closeResources([
      () => source?.return?.(),
      () => materialized?.close(),
      () => prepared?.close(),
    ]))
  async function terminal(fact: Terminal): Promise<Terminal> {
    await Promise.allSettled([close()])
    return fact
  }

  async function prepareResources(): Promise<
    Outcome<MaterializedTransport, Extract<Terminal, { kind: 'not-started' }>>
  > {
    if (signal.aborted) {
      return fail({ kind: 'not-started', reason: 'cancelled' })
    }
    const preparationResult = await preparation(
      // An independent execution is one first dispatch: no message is resent.
      () => transport.prepare(request, supplier, { resent: [] }),
      'prepare',
    )
    if ('ok' in preparationResult) prepared = preparationResult.ok
    if (signal.aborted) {
      return fail({ kind: 'not-started', reason: 'cancelled' })
    }
    if ('failure' in preparationResult) {
      return fail({
        kind: 'not-started',
        reason: 'rejected',
        failure: preparationResult.failure,
      })
    }

    const materialization = await preparation(
      () => preparationResult.ok.materialize(signal),
      'materialize',
    )
    if ('ok' in materialization) materialized = materialization.ok
    if (signal.aborted) {
      return fail({ kind: 'not-started', reason: 'cancelled' })
    }
    if ('failure' in materialization) {
      return fail({
        kind: 'not-started',
        reason: 'rejected',
        failure: materialization.failure,
      })
    }
    return succeed(materialization.ok)
  }

  try {
    const materialization = await prepareResources()
    if ('failure' in materialization) {
      yield await terminal(materialization.failure)
      return
    }

    const receipt = await preparation(
      () =>
        receiptMatches(materialization.ok, expected)
          ? succeed(undefined)
          : fail({ kind: 'invalid', field: 'receipt', reason: 'materialization-receipt-mismatch' }),
      'receipt',
    )
    if (signal.aborted) {
      yield await terminal({ kind: 'not-started', reason: 'cancelled' })
      return
    }
    if ('failure' in receipt) {
      yield await terminal({ kind: 'not-started', reason: 'rejected', failure: receipt.failure })
      return
    }

    let ending: Extract<Terminal, { kind: 'ended' }> | undefined
    try {
      source = materialization.ok.start(signal)[Symbol.asyncIterator]()
    } catch {
      ending = streamLost('start')
    }
    while (source !== undefined && ending === undefined) {
      const step = await readFact(source)
      if (step.kind === 'ended') ending = step.value
      else yield step.value
    }
    yield await terminal(ending ?? streamLost('start'))
  } finally {
    await close()
  }
}

export function executeModel(
  request: FixedModelRequest,
  transport: ModelTransport,
  signal: AbortSignal,
): AsyncIterable<IndependentModelFact> {
  return execute(request, transport, signal)
}
