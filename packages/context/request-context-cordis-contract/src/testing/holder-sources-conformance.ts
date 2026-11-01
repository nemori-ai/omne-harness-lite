// The conformance suite of `contextHolderSources`: one case for each leased part and for each lease
// property. The fixture plugs the holder under test into a Context the suite owns; the suite takes
// leases from a borrower plugin and observes only the lease, the settlement calls and `readsClosed`.
import { Context } from '@deepseek-ai/cordis'
import type { Access, SourceSettlement } from '@omne-harness/request-context-contract'
import { contextHolderSourcesKey } from '../cordis.js'
import type {
  ContextHolderLease,
  ContextHolderLeaseResult,
  ContextHolderParts,
  LeaseSettlement,
} from '../holder-sources.js'

/** One call of one part, and the result kind that call gives while the access is admitted. */
export type ContextHolderPartCall<P> = Readonly<{
  call(parts: ContextHolderParts<P>, access: Access<P>): Promise<Readonly<{ kind: string }>>
  admitted: string
}>

export interface ContextHolderUnderTest<P> {
  /** An access the holder admits when it starts. */
  readonly access: Access<P>
  /** Unloads the plugin that provides the key; ends when the holder has closed its reads. */
  stop(): Promise<void>
  /** True once the holder has closed the reads it lent. */
  readsClosed(): boolean
  /** Ends the current eligibility of `access` where the holder checks it. */
  revoke(access: Access<P>): void
  readonly calls: Readonly<{ [K in keyof ContextHolderParts<P>]: ContextHolderPartCall<P> }>
}

export interface ContextHolderSourcesFixture<P> {
  /** Plugs a fresh holder that provides `contextHolderSources` into `ctx`. */
  start(ctx: Context): Promise<ContextHolderUnderTest<P>>
}

export type ContextHolderSourcesCase = Readonly<{
  name: string
  clause: string
  run(): Promise<void>
}>

type Part = keyof ContextHolderParts<unknown>
const PARTS: readonly Readonly<{ part: Part; name: string }>[] = [
  { part: 'history', name: 'history' },
  { part: 'adopted', name: 'adopted' },
  { part: 'eligibility', name: 'eligibility' },
  { part: 'resolveHistory', name: 'resolve-history' },
]
const SETTLED: SourceSettlement = { kind: 'settled' }

function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

/** A settlement function that counts its calls and ends only when `finish` is called. */
function gatedSettlement() {
  const gate = Promise.withResolvers<SourceSettlement>()
  let calls = 0
  return {
    settle: (): Promise<SourceSettlement> => {
      calls++
      return gate.promise
    },
    calls: () => calls,
    finish: () => gate.resolve(SETTLED),
  }
}

/** A settlement function that counts its calls and has nothing to wait for. */
function readySettlement() {
  let calls = 0
  return {
    settle: (): Promise<SourceSettlement> => {
      calls++
      return Promise.resolve(SETTLED)
    },
    calls: () => calls,
  }
}

/** Lets pending callbacks and timers of the holder run. */
async function drain(): Promise<void> {
  for (let round = 0; round < 3; round++) await new Promise(resolve => setTimeout(resolve, 0))
}

async function borrow(ctx: Context, settle: LeaseSettlement) {
  let result: ContextHolderLeaseResult<unknown> | undefined
  const fiber = await ctx.plugin({
    name: 'holder-sources-conformance-borrower',
    inject: [contextHolderSourcesKey],
    apply(inner) {
      result = inner.contextHolderSources.lease({ settle })
    },
  })
  if (result?.kind !== 'leased')
    throw new Error(`The borrower expected a lease, got ${result?.kind ?? 'nothing'}`)
  const lease: ContextHolderLease<unknown> = result.lease
  return { lease, fiber }
}

async function kinds<P>(
  holder: ContextHolderUnderTest<P>,
  parts: ContextHolderParts<P>,
): Promise<Readonly<Record<Part, string>>> {
  const { access, calls } = holder
  return {
    history: (await calls.history.call(parts, access)).kind,
    adopted: (await calls.adopted.call(parts, access)).kind,
    eligibility: (await calls.eligibility.call(parts, access)).kind,
    resolveHistory: (await calls.resolveHistory.call(parts, access)).kind,
  }
}

const cases = <P>(fixture: ContextHolderSourcesFixture<P>): ContextHolderSourcesCase[] => [
  ...PARTS.map(({ part, name }) => ({
    name: `${name}-part-answers-through-the-lease`,
    clause: `K-RQ parts: the lease hands out the holder read \`${part}\``,
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const { lease } = await borrow(ctx, readySettlement().settle)
      const { kind } = await holder.calls[part].call(lease.parts, holder.access)
      expectThat(
        kind === holder.calls[part].admitted,
        `${part}: expected ${holder.calls[part].admitted}, got ${kind}`,
      )
      lease.release()
      await holder.stop()
    },
  })),
  {
    name: 'lease-release-can-be-called-again',
    clause: 'K-RQ lease 1: a lease is an effect of the borrower fiber; its release is idempotent',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const settlement = readySettlement()
      const { lease, fiber } = await borrow(ctx, settlement.settle)
      lease.release()
      lease.release()
      await fiber.dispose()
      expectThat(settlement.calls() === 1, `settlement called ${settlement.calls()} times, not 1`)
      await holder.stop()
      expectThat(holder.readsClosed(), 'the holder closes its reads once the lease has settled')
    },
  },
  {
    name: 'release-pulls-the-settlement',
    clause: 'K-RQ lease 2: the holder calls the settlement function of the borrower at release',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const settlement = readySettlement()
      const { lease } = await borrow(ctx, settlement.settle)
      expectThat(settlement.calls() === 0, 'the settlement is not called while the lease holds')
      lease.release()
      expectThat(settlement.calls() === 1, 'release returns after the holder called the settlement')
      await holder.stop()
      expectThat(holder.readsClosed(), 'the holder closes its reads once the lease has settled')
    },
  },
  {
    name: 'reads-stay-open-until-the-settlement-ends',
    clause: 'K-RQ lease 3: the holder closes a lent read only after the settlement has ended',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const settlement = gatedSettlement()
      const { lease } = await borrow(ctx, settlement.settle)
      lease.release()
      const stopping = holder.stop()
      await drain()
      expectThat(!holder.readsClosed(), 'a pending settlement keeps the reads open')
      settlement.finish()
      await stopping
      expectThat(holder.readsClosed(), 'the reads close after the settlement has ended')
    },
  },
  {
    name: 'borrower-unload-ends-the-lease',
    clause:
      'K-RQ lease 4: the borrower fiber unloading ends the lease; the holder pulls the settlement and waits for it',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const settlement = gatedSettlement()
      const { fiber } = await borrow(ctx, settlement.settle)
      await fiber.dispose()
      expectThat(settlement.calls() === 1, 'the unload called the settlement once')
      const stopping = holder.stop()
      await drain()
      expectThat(!holder.readsClosed(), 'a pending settlement keeps the reads open')
      settlement.finish()
      await stopping
      expectThat(holder.readsClosed(), 'the reads close after the settlement has ended')
    },
  },
  {
    name: 'holder-stop-waits-for-an-unloading-borrower',
    clause:
      'K-RQ lease 3, 4: a holder that stops first still waits for the settlement pulled when its borrower unloads',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const settlement = gatedSettlement()
      await borrow(ctx, settlement.settle)
      const stopping = holder.stop()
      await drain()
      expectThat(settlement.calls() === 1, 'the borrower unload called the settlement once')
      expectThat(!holder.readsClosed(), 'a pending settlement keeps the reads open')
      settlement.finish()
      await stopping
      expectThat(holder.readsClosed(), 'the reads close after the settlement has ended')
    },
  },
  {
    name: 'every-call-checks-the-current-access',
    clause: 'K-RQ lease 5: every call of every part checks the current eligibility of its access',
    async run() {
      const ctx = new Context()
      const holder = await fixture.start(ctx)
      const { lease } = await borrow(ctx, readySettlement().settle)
      const before = await kinds(holder, lease.parts)
      for (const { part } of PARTS)
        expectThat(
          before[part] === holder.calls[part].admitted,
          `${part}: expected ${holder.calls[part].admitted} while admitted, got ${before[part]}`,
        )
      holder.revoke(holder.access)
      const after = await kinds(holder, lease.parts)
      for (const { part } of PARTS)
        expectThat(
          after[part] === 'denied',
          `${part}: expected denied after revoke, got ${after[part]}`,
        )
      lease.release()
      await holder.stop()
    },
  },
]

/** The cases of the holder sources suite; run each one and report it by `name`. */
export function contextHolderSourcesConformance<P>(
  fixture: ContextHolderSourcesFixture<P>,
): readonly ContextHolderSourcesCase[] {
  return cases(fixture)
}
