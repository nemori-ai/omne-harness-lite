import { readdirSync } from 'node:fs'
import { canonical, digest, integer, object, same, string } from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import { operationJournal } from './operation-journal.ts'
import { InputError } from './protocol.ts'
import { parseReduceSignal as parseSavedSignal } from './reduce-supervise-values.ts'
import type { ReduceSignal, SuperviseInput } from './reduce-supervise.ts'

/** Receipt and acknowledgement are separate immutable files. Returning a signal does not consume it. */
export function superviseJournal(input: SuperviseInput) {
  const journal = operationJournal(input.journalRoot, input.operationId)
  const identity = { context: input.context, owner: input.owner, epoch: input.epoch }
  const saved = journal.read('identity.json')
  if (saved === undefined) journal.save('identity.json', identity)
  else same(saved, identity, 'reduce-supervise-identity-conflict')
  return {
    add(signal: ReduceSignal) {
      const id = digest(
        canonical([signal.signalKind, signal.identity, signal.observed, signal.reasonCode]),
      )
      const name = `signal-${id}.json`
      if (journal.read(name) === undefined)
        journal.save(name, {
          id,
          ordinal:
            readdirSync(journal.directory).filter(name => name.startsWith('signal-')).length + 1,
          signal,
        })
      return id
    },
    pending(): { id: string; signal: ReduceSignal }[] {
      return readdirSync(journal.directory)
        .filter(name => /^signal-[0-9a-f]{64}\.json$/.test(name))
        .sort()
        .flatMap(name => {
          const id = name.slice(7, -5)
          const handled = journal.read(`handled-${id}.json`)
          if (handled !== undefined) {
            const ack = object(handled, 'signal acknowledgement')
            if (ack.id !== id || string(ack.evidence, 'ack.evidence').trim() === '')
              throw new InputError('reduce-supervise-journal-corrupt')
            return []
          }
          const entry = journal.read(name)
          const copy = strictJson(canonical(entry))
          if (
            typeof copy !== 'object' ||
            copy === null ||
            !('id' in copy) ||
            copy.id !== id ||
            !('signal' in copy) ||
            !('ordinal' in copy)
          )
            throw new InputError('reduce-supervise-journal-corrupt')
          return [
            {
              id,
              ordinal: integer(copy.ordinal, 'signal ordinal'),
              signal: parseSavedSignal(copy.signal),
            },
          ]
        })
        .sort((a, b) => a.ordinal - b.ordinal)
        .map(({ id, signal }) => ({ id, signal }))
    },
    acknowledge(id: string, evidence: string) {
      if (!/^[0-9a-f]{64}$/.test(id) || evidence.trim() === '')
        throw new InputError('reduce-supervise-ack-invalid')
      if (journal.read(`signal-${id}.json`) === undefined)
        throw new InputError('reduce-supervise-signal-missing')
      const prior = journal.read(`handled-${id}.json`)
      const record = { id, evidence }
      if (prior === undefined) journal.save(`handled-${id}.json`, record)
      else same(prior, record, 'reduce-supervise-ack-conflict')
    },
  }
}
