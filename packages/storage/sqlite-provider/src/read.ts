// read, control side (SPEC 9.2). Steps 1 to 5 are judged here and never queue. Step 6 reserves in
// the read pool, which then waits for the domain, queues, dispatches and gives the result (steps 7
// to 13). A read of an absent domain does not create a file. The pool owns the readers.
import type {
  ReadRequest,
  ReadResult,
  ReadUnavailableReason,
  SqlStorage,
} from '@omne-harness/sql-contract'
import type { Core } from './core.ts'
import { DOMAIN_BYTES, decodeScope, isName } from './fields.ts'
import { canonicalJson, isStrictJson, jsonShape, utf8Length } from './json.ts'

export function createRead(core: Core): SqlStorage['read'] {
  const { config } = core
  return async (input: ReadRequest, options): Promise<ReadResult> => {
    const raw = input as Partial<ReadRequest> | null
    const requestKey = isName(raw?.requestKey) ? raw.requestKey : null
    const unavailable = (reason: ReadUnavailableReason, text: string = reason): ReadResult =>
      ({
        kind: 'unavailable',
        requestKey,
        reason,
        diagnostic: core.diagnostic(text),
      }) as ReadResult
    if (core.lifecycle.closing) return unavailable('closing')
    if (options?.signal?.aborted === true) return { kind: 'cancelled', requestKey }
    const scope = decodeScope(raw?.domain?.scope)
    if (
      requestKey === null ||
      scope === null ||
      !isName(raw?.domain?.transactionDomain, DOMAIN_BYTES) ||
      !isName(raw.handler) ||
      !isName(raw.protocol) ||
      !('input' in raw) ||
      !isStrictJson(raw.input)
    )
      return unavailable('invalid')
    const shape = jsonShape(raw.input)
    if (
      shape.depth > config.maxJsonDepth ||
      shape.members > config.maxJsonMembers ||
      utf8Length(canonicalJson(raw.input)) > config.maxReadInputBytes
    )
      return unavailable('read_limit', 'input_limit')
    const handler = core.catalog.readHandlers.find(
      item => item.handler === raw.handler && item.protocol === raw.protocol,
    )
    // A handler that may return more than the provider allows cannot be served (SPEC 12.1).
    if (handler === undefined || handler.maxOutputBytes > config.maxReadResultBytes)
      return unavailable('handler_unavailable')
    const outcome = await core.readers
      .read({
        domain: raw.domain.transactionDomain,
        scope,
        handler,
        input: raw.input,
        signal: options?.signal,
      })
      .catch(() => null)
    if (outcome === null) return unavailable('read_failed', 'provider_error')
    switch (outcome.kind) {
      case 'read':
        return { kind: 'read', requestKey, output: outcome.output }
      case 'cancelled':
        return { kind: 'cancelled', requestKey }
      case 'unavailable':
        return unavailable(outcome.reason, outcome.diagnostic)
    }
  }
}
