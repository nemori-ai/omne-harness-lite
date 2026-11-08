import { fail, succeed } from '@omne-harness/operation-result'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type { ToolBodyWrites } from '@omne-harness/tool-contract/provider'
import { judgeCallInput } from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import { mintEvidence, sameFactValue } from './evidence.ts'
import { put, reply } from './ledger-decider.ts'

import {
  createWriterAccess,
  fromReply,
  sequence,
  type WriterPorts,
} from './ledger-writer-access.ts'
import {
  admitAppend,
  admitSeal,
  appendRecords,
  beginWriter,
  commit,
  originalStart,
  operationUsed,
  reject,
  scopeFor,
  writerIdentity,
} from './ledger-writer-decisions.ts'
import { createWriterProgress } from './ledger-writer-progress.ts'
import { prepareWriterFrame } from './ledger-writer-frame.ts'

export function createLedgerBodyWrites<P>(ports: WriterPorts<P>): ToolBodyWrites<P> {
  const { bind, transact } = createWriterAccess(ports)
  const { retainAppend, sealWriter } = createWriterProgress(ports, transact)
  return {
    begin: async supplied => {
      const bound = await bind(supplied, ['representation'])
      if ('failure' in bound) return bound
      const answer = await transact(bound.ok.input, (snapshot, mint) =>
        beginWriter(
          snapshot,
          mint,
          bound.ok.input,
          bound.ok.fields.representation,
          ports.configuration,
        ),
      )
      return 'failure' in answer
        ? answer
        : succeed({ key: answer.ok.key, nextSequence: '1', custody: answer.ok.custody })
    },
    append: async supplied => {
      const bound = await bind(supplied, ['sequence', 'frame'])
      if ('failure' in bound) return bound
      const number = bound.ok.fields.sequence
      if (!sequence(number, false))
        return fail({ kind: 'invalid', reason: 'positive canonical sequence required' })
      const frame = await prepareWriterFrame(
        bound.ok.fields.frame,
        bound.ok.snapshot,
        bound.ok.input,
        number,
        ports.bodySchemas,
      )
      if ('failure' in frame) return frame
      const admitted = await transact(bound.ok.input, snapshot =>
        admitAppend(snapshot, bound.ok.input, number, frame.ok),
      )
      if ('failure' in admitted) return admitted
      const retained = await retainAppend(bound.ok.input, admitted.ok)
      return 'failure' in retained
        ? retained
        : retained.ok.state.kind === 'retained'
          ? succeed({
              nextSequence: String(BigInt(number) + 1n),
              custody: retained.ok.state.custody,
            })
          : fail({
              kind: 'unknown',
              operation: bound.ok.input.operation,
              reason: 'append retention is unconfirmed',
            })
    },
    seal: async supplied => {
      const bound = await bind(supplied, ['afterSequence'])
      if ('failure' in bound) return bound
      const last = bound.ok.fields.afterSequence
      if (!sequence(last, true))
        return fail({ kind: 'invalid', reason: 'canonical last sequence required' })
      const admitted = await transact(bound.ok.input, snapshot =>
        admitSeal(snapshot, bound.ok.input, last),
      )
      return 'failure' in admitted ? admitted : sealWriter(bound.ok.input, admitted.ok)
    },
    inspect: async supplied => {
      const input = judgeCallInput<P>(supplied, 'write')
      if ('failure' in input) return fromReply(input, 'inspect')
      const fields = fixCleanupFields(supplied, ['start', 'key'])
      if ('failure' in fields) return fromReply(fields, 'inspect')
      const allowed = await ports.entry(input.ok, 'write')
      if ('failure' in allowed) return fromReply(allowed, 'inspect')
      const loaded = await ports.load(input.ok)
      if ('failure' in loaded) return fromReply(loaded, 'inspect')
      const start = originalStart(loaded.ok, fields.ok.start)
      if (start === null || typeof fields.ok.key !== 'string')
        return fail({ kind: 'invalid', reason: 'original start and key required' })
      const writer = loaded.ok.writers.get(writerIdentity(start, fields.ok.key))
      if (writer === undefined) return fail({ kind: 'invalid', reason: 'writer does not exist' })
      const current = await ports.entry(input.ok, 'write')
      if ('failure' in current) return fromReply(current, 'inspect')
      switch (writer.state.kind) {
        case 'sealed':
          return succeed({ kind: 'sealed', body: writer.state.body })
        case 'sealing':
          return succeed({ kind: 'sealing', afterSequence: writer.state.afterSequence })
        case 'failed':
          return succeed({ kind: 'failed', failure: writer.state.failure })
        case 'open': {
          let confirmedThrough = '0'
          for (const append of appendRecords(loaded.ok, writer.id)) {
            if (append.state.kind !== 'retained') break
            confirmedThrough = append.sequence
          }
          return succeed({ kind: 'open', nextSequence: writer.nextSequence, confirmedThrough })
        }
      }
    },
    close: async supplied => {
      const bound = await bind(supplied, ['exit'], false)
      if ('failure' in bound) return bound
      const { input, fields } = bound.ok
      if (fields.exit !== 'returned' && fields.exit !== 'failed')
        return fail({ kind: 'invalid', reason: 'invalid writer exit' })
      const exit = fields.exit
      return transact(input, (snapshot, mint) => {
        const scope = scopeFor(snapshot, input.start, ports.configuration)
        if (scope.state.kind === 'open' && operationUsed(snapshot, input.operation))
          return reject('conflict', 'operation already used')
        if (
          scope.state.kind === 'closed' &&
          (scope.state.operation !== input.operation ||
            scope.state.exit !== exit ||
            !sameFactValue(scope.state.source, input.source))
        )
          return reject('conflict', 'scope already closed differently')
        const custody =
          scope.state.kind === 'closed'
            ? scope.state.custody
            : mintEvidence(
                'body-write',
                { tenant: input.tenant, call: input.call, operation: input.operation },
                mint.revision,
                { exit, start: input.start, source: input.source },
              )
        const writers = [...snapshot.writers.values()].filter(writer =>
          sameFactValue(writer.start, input.start),
        )
        const ids = new Set(writers.map(writer => writer.id))
        const pendingOperations = [...snapshot.writerAppends.values()]
          .filter(append => ids.has(append.writer) && append.state.kind === 'staged')
          .map(append => append.operation)
        for (const writer of writers)
          if (writer.state.kind === 'sealing') pendingOperations.push(writer.state.operation)
        const receipt = {
          custody,
          pendingOperations,
          unsealedKeys: writers
            .filter(writer => writer.state.kind !== 'sealed')
            .map(writer => writer.key),
        }
        return scope.state.kind === 'closed'
          ? reply(succeed(succeed(receipt)))
          : commit(receipt, [
              put({
                kind: 'body-writer-scope',
                scope: {
                  ...scope,
                  state: {
                    kind: 'closed',
                    operation: input.operation,
                    exit,
                    source: input.source,
                    custody,
                  },
                },
              }),
            ])
      })
    },
    reconcile: async supplied => {
      const context = judgeCallInput<P>(supplied, 'write')
      if ('failure' in context) return fromReply(context, 'reconcile')
      const fields = fixCleanupFields(supplied, ['start', 'maxOperations'])
      if ('failure' in fields) return fromReply(fields, 'reconcile')
      const max = fields.ok.maxOperations
      if (typeof max !== 'number' || !Number.isSafeInteger(max) || max < 1)
        return fail({ kind: 'invalid', reason: 'positive recovery bound required' })
      const allowed = await ports.entry(context.ok, 'write')
      if ('failure' in allowed) return fromReply(allowed, 'reconcile')
      const loaded = await ports.load(context.ok)
      if ('failure' in loaded) return fromReply(loaded, 'reconcile')
      const start = originalStart(loaded.ok, fields.ok.start)
      if (start === null) return fail({ kind: 'invalid', reason: 'original start required' })
      let examined = 0
      const evidence: DurableEvidence[] = []
      for (const writer of loaded.ok.writers.values()) {
        if (!sameFactValue(writer.start, start)) continue
        const input = {
          ...context.ok,
          start,
          source: writer.source,
          operation: writer.operation,
          key: writer.key,
        }
        for (const append of appendRecords(loaded.ok, writer.id)) {
          if (append.state.kind !== 'staged' || examined >= max) continue
          examined++
          const retained = await retainAppend(input, append)
          if ('failure' in retained) return retained
          if (retained.ok.state.kind === 'retained') evidence.push(retained.ok.state.custody)
        }
        if (writer.state.kind === 'sealing' && examined < max) {
          examined++
          const body = await sealWriter(input, writer)
          if ('failure' in body) return body
          evidence.push(body.ok.custody)
        }
      }
      const current = await ports.load(context.ok)
      if ('failure' in current) return fromReply(current, 'reconcile')
      const qualified = await ports.entry(context.ok, 'write')
      if ('failure' in qualified) return fromReply(qualified, 'reconcile')
      const ids = new Set(
        [...current.ok.writers.values()]
          .filter(writer => sameFactValue(writer.start, start))
          .map(writer => writer.id),
      )
      const pending =
        [...current.ok.writerAppends.values()].filter(
          append => ids.has(append.writer) && append.state.kind === 'staged',
        ).length +
        [...current.ok.writers.values()].filter(
          writer => ids.has(writer.id) && writer.state.kind === 'sealing',
        ).length
      return succeed({ examined, pending, custody: evidence })
    },
  }
}
