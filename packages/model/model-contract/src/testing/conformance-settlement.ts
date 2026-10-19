// The checks of the result and its handover: a result is read only after the call has ended, a
// call is acknowledged only with evidence, and an acknowledgement is neither repeated nor undone.
import type { AckReceipt, ResultPart } from '../index.ts'
import {
  ackInput,
  accessOf,
  acknowledged,
  acknowledgedOperation,
  ended,
  evidenceFor,
  expect,
  hookOf,
  mutationOf,
  operationId,
  pageOf,
  readOf,
  refused,
  refusedAs,
  resultBlocks,
  running,
  runtimeOf,
  same,
  show,
  stateOf,
  succeeded,
  targetOf,
  textBlock,
  versionId,
} from './conformance-kit.ts'
import { ConformanceSkip, type Check } from './conformance-types.ts'

/** What an acknowledgement says about the call, without the cleanup, which moves on by itself. */
function identityOf(receipt: AckReceipt) {
  return {
    call: receipt.call,
    result: receipt.result,
    operation: receipt.custody.operation,
    receipt: receipt.custody.receipt,
  }
}

export function settlementChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'mixed-partial-result-readable',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const expected: readonly ResultPart[] = [
          {
            kind: 'sealed',
            block: textBlock('mixed', 'sealed'),
            trims: [{ removed: '1', reason: 'before-seal' }],
          },
          {
            kind: 'partial',
            content: 'tool-arguments',
            value: '{"kept":',
            trims: [{ removed: '2', reason: 'cut' }],
          },
          { kind: 'partial', content: 'voice', value: 'retained', trims: [] },
        ]
        const termination = {
          kind: 'failed',
          fault: { cause: 'upstream-protocol', diagnostic: 'partial', upstreamStatus: null },
        } as const
        const call = await ended(scene, 'mixed-partial', {
          parts: expected,
          termination,
          pageSize: 2,
          pageTargetBytes: 128,
        })
        const { consumption } = runtimeOf(scene)
        const first = await readOf(scene, call)
        const parts: ResultPart[] = [...first.page.parts]
        expect(
          same(first.page.settlement.termination, termination),
          'the partial result lost its termination',
        )
        let after = first.page.next
        for (let count = 0; after !== null; count += 1) {
          expect(count < 100, 'the partial result does not end')
          const input = { ...accessOf(scene, call.call), read: first.read, after }
          const next = pageOf(
            succeeded(await consumption.readNext(input), 'the partial page'),
            'the partial page',
          )
          const replay = pageOf(
            succeeded(await consumption.readNext(input), 'the partial page replay'),
            'the partial page replay',
          )
          expect(same(next, replay), 'the partial page changed on replay')
          expect(
            same(next.settlement, first.page.settlement),
            'the partial page changed its settlement',
          )
          parts.push(...next.parts)
          after = next.next
        }
        expect(
          same(parts, expected),
          `the final result lost or changed parts or trims: ${show(parts)}`,
        )
      },
    },
    {
      name: 'settled-call-keeps-termination',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const call = await ended(scene, 'keeps-end')
        // The hook leaves a call that has ended as it is, so it cannot test the provider. A cancel
        // is a step of the public face that could unsettle a call; any reply to it is accepted.
        await runtimeOf(scene).calls.cancel(mutationOf(scene, call.call, operationId('after-end')))
        const after = await stateOf(scene, call)
        expect(after.phase === 'settled', `the call that ended is now ${after.phase}`)
        expect(
          same(after.settlement.termination, call.state.settlement.termination),
          `the termination changed after the call ended: ${show(after.settlement.termination)}`,
        )
      },
    },
    {
      name: 'read-before-settle-refused',
      requires: ['startRun'],
      async run(scene) {
        const call = await running(scene, 'early-read')
        const outcome = await runtimeOf(scene).consumption.beginRead({
          ...mutationOf(scene, call.call, operationId('early-read')),
          result: versionId('early'),
        })
        refusedAs(outcome, 'not-settled', 'the read of a running call')
      },
    },
    {
      name: 'acknowledge-refused-before-settle',
      requires: ['startRun'],
      async run(scene) {
        const call = await running(scene, 'early-ack')
        const outcome = await runtimeOf(scene).consumption.acknowledge({
          ...mutationOf(scene, call.call, operationId('early-ack')),
          result: versionId('early'),
          evidence: {
            kind: 'processed',
            completion: { owner: 'conformance', record: 'early', revision: '1', digest: 'early' },
          },
        })
        refused(outcome, 'the acknowledgement of a running call')
        const state = await stateOf(scene, call)
        expect(state.custody.kind === 'producer', `the custody moved: ${show(state.custody)}`)
      },
    },
    {
      name: 'forged-evidence-refused',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'forged')
        const genuine = await evidenceFor(scene, call, 'ack')
        const forged = { ...genuine, digest: `${genuine.digest}-forged` }
        const outcome = await runtimeOf(scene).consumption.acknowledge(
          ackInput(scene, call, operationId('forged'), forged),
        )
        refused(outcome, 'the acknowledgement with forged evidence')
        const state = await stateOf(scene, call)
        expect(
          state.custody.kind === 'producer',
          `forged evidence moved the custody: ${show(state.custody)}`,
        )
      },
    },
    {
      name: 'acknowledge-records-custody',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'records')
        const { operation, receipt } = await acknowledged(scene, call)
        expect(receipt.call === call.call, `the receipt names ${receipt.call}`)
        expect(receipt.result === call.version, `the receipt names the result ${receipt.result}`)
        expect(
          receipt.custody.operation === operation,
          `the receipt names the operation ${receipt.custody.operation}, not ${operation}`,
        )
        const state = await stateOf(scene, call)
        expect(
          acknowledgedOperation(state.custody) === operation,
          `the call does not show the acknowledgement of ${operation}: ${show(state.custody)}`,
        )
      },
    },
    {
      name: 'duplicate-acknowledge-returns-original',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'duplicate')
        const first = await acknowledged(scene, call)
        const again = succeeded(
          await runtimeOf(scene).consumption.acknowledge(
            ackInput(scene, call, first.operation, structuredClone(first.evidence)),
          ),
          'the repeated acknowledgement',
        )
        expect(
          same(identityOf(again), identityOf(first.receipt)),
          `the repeat gives another receipt: ${show(identityOf(again))}`,
        )
      },
    },
    {
      name: 'acknowledge-conflict-on-different-input',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'ack-conflict')
        const first = await acknowledged(scene, call, 'one')
        const other = await evidenceFor(scene, call, 'two')
        const failure = refusedAs(
          await runtimeOf(scene).consumption.acknowledge(
            ackInput(scene, call, first.operation, other),
          ),
          'conflict',
          'the acknowledgement with other evidence',
        )
        expect(
          failure.operation === first.operation,
          `the conflict names another operation: ${show(failure)}`,
        )
      },
    },
    {
      name: 'acknowledged-result-not-read-again',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'after-ack')
        await acknowledged(scene, call)
        const outcome = succeeded(
          await runtimeOf(scene).consumption.beginRead({
            ...mutationOf(scene, call.call, operationId('read-after-ack')),
            result: call.version,
          }),
          'the read after the acknowledgement',
        )
        expect(
          outcome.kind === 'acknowledged',
          `a read began after the acknowledgement: ${show(outcome)}`,
        )
      },
    },
    {
      name: 'acknowledge-and-read-serialised',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        for (const order of ['ack-first', 'read-first'] as const) {
          const call = await ended(scene, `serial-${order}`)
          const evidence = await evidenceFor(scene, call, 'ack')
          const operation = operationId(`serial-ack-${order}`)
          const acknowledge = () =>
            consumption.acknowledge(ackInput(scene, call, operation, evidence))
          const beginRead = () =>
            consumption.beginRead({
              ...mutationOf(scene, call.call, operationId(`serial-read-${order}`)),
              result: call.version,
            })
          const pending =
            order === 'ack-first'
              ? { ack: acknowledge(), read: beginRead() }
              : { read: beginRead(), ack: acknowledge() }
          const [ack, read] = await Promise.all([pending.ack, pending.read])
          succeeded(ack, `the acknowledgement in the order ${order}`)
          const started = succeeded(read, `the read in the order ${order}`)
          if (started.kind === 'acknowledged') {
            expect(
              started.custody.operation === operation,
              `the read sees the acknowledgement of ${started.custody.operation}, not ${operation} (${order})`,
            )
          } else {
            succeeded(
              await consumption.closeRead({ ...accessOf(scene, call.call), read: started.read }),
              `the close of the read that began first (${order})`,
            )
          }
        }
      },
    },
    {
      name: 'read-page-stable-for-same-after',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        const call = await ended(scene, 'stable-page')
        const { read, page } = await readOf(scene, call)
        if (page.next === null)
          throw new ConformanceSkip('the provider gave the whole result as one page')
        const input = { ...accessOf(scene, call.call), read, after: page.next }
        const first = succeeded(await consumption.readNext(input), 'the first read of the page')
        const second = succeeded(
          await consumption.readNext({ ...input }),
          'the second read of the page',
        )
        expect(same(first, second), `the same page differs: ${show(first)} and ${show(second)}`)
      },
    },
    {
      name: 'close-read-idempotent',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        const call = await ended(scene, 'close-twice')
        const { read } = await readOf(scene, call)
        const input = { ...accessOf(scene, call.call), read }
        const first = succeeded(await consumption.closeRead(input), 'the first close')
        const second = succeeded(await consumption.closeRead({ ...input }), 'the second close')
        expect(first.kind === 'ended', `the first close gives ${show(first)}, not an end`)
        expect(same(first, second), `the second close differs: ${show(first)} and ${show(second)}`)
      },
    },
    {
      name: 'acknowledge-keeps-open-read-readable',
      requires: ['startRun', 'settleCall', 'provideEvidence', 'advanceCleanup'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        const call = await ended(scene, 'open-read')
        const { read, page } = await readOf(scene, call)
        if (page.next === null)
          throw new ConformanceSkip('the provider gave the whole result as one page')
        await acknowledged(scene, call)
        await hookOf(scene, 'advanceCleanup')(targetOf(scene, call.call))
        const ids = page.parts.flatMap(part => (part.kind === 'sealed' ? [part.block.id] : []))
        let after: string | null = page.next
        for (let pages = 0; after !== null; pages += 1) {
          expect(pages < 100, 'the read does not end')
          const next = pageOf(
            succeeded(
              await consumption.readNext({ ...accessOf(scene, call.call), read, after }),
              'the page after the acknowledgement',
            ),
            'the page after the acknowledgement',
          )
          ids.push(...next.parts.flatMap(part => (part.kind === 'sealed' ? [part.block.id] : [])))
          after = next.next
        }
        expect(
          same(
            ids,
            resultBlocks().map(block => block.id),
          ),
          `the read gave ${show(ids)} after the acknowledgement`,
        )
      },
    },
    {
      name: 'revoked-reader-gets-no-page',
      requires: ['startRun', 'settleCall', 'revokeAccess'],
      async run(scene) {
        const { consumption } = runtimeOf(scene)
        const call = await ended(scene, 'revoked-read')
        const { read, page } = await readOf(scene, call)
        if (page.next === null)
          throw new ConformanceSkip('the provider gave the whole result as one page')
        await hookOf(
          scene,
          'revokeAccess',
        )({
          ...targetOf(scene, call.call),
          principal: scene.subject.principal,
          action: 'read',
        })
        const outcome = await consumption.readNext({
          ...accessOf(scene, call.call),
          read,
          after: page.next,
        })
        if ('failure' in outcome) {
          expect(
            outcome.failure.kind === 'denied',
            `the revoked read failed with ${show(outcome.failure)}`,
          )
          return
        }
        expect(
          same(outcome.ok, { kind: 'ended', reason: 'denied' }),
          `the revoked principal still reads: ${show(outcome.ok)}`,
        )
      },
    },
    {
      name: 'cleanup-failure-keeps-acknowledgement',
      requires: ['startRun', 'settleCall', 'provideEvidence', 'blockCleanup'],
      async run(scene) {
        const call = await ended(scene, 'blocked-cleanup')
        const first = await acknowledged(scene, call)
        await hookOf(scene, 'blockCleanup')(targetOf(scene, call.call))
        const state = await stateOf(scene, call)
        expect(
          state.custody.kind === 'acknowledged',
          `a cleanup that cannot go on withdrew the acknowledgement: ${show(state.custody)}`,
        )
        succeeded(
          await runtimeOf(scene).consumption.acknowledge(
            ackInput(scene, call, first.operation, structuredClone(first.evidence)),
          ),
          'the repeated acknowledgement after the cleanup failed',
        )
      },
    },
  ]
}
