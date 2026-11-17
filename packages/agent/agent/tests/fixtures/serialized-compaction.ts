import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeCompactionHandoff,
  decodeCompactionOperationId,
  decodeCompactionRequest,
  decodeCompactionTaskRef,
  decodeCompactionTaskState,
  encodeCompactionRequest,
  encodeCompactionTaskRef,
  encodeCompactionTaskState,
  type ContextCompaction,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { ok } from '../journal-support.ts'

export function serializedCompaction(
  service: ContextCompaction<string>,
  // A lost reply: the service applied the call. An unapplied call: the link broke before it.
  lose: 'admit' | 'acknowledge' | 'admit-unapplied' | 'acknowledge-unapplied',
) {
  const calls: { method: string; bytes: number }[] = []
  let disconnected = false
  const round = async (method: string, body: string) => {
    calls.push({ method, bytes: Buffer.byteLength(body) })
    await new Promise<void>(resolve => setTimeout(resolve, 1))
    return Buffer.from(body).toString('utf8')
  }
  const access = (input: { principal: string; tenant: TenantId }) => {
    const encoded = tenantCodec.encode(input.tenant)
    if (!encoded.ok) throw new Error('invalid client tenant')
    const read: unknown = JSON.parse(
      JSON.stringify({ principal: input.principal, tenant: encoded.value }),
    )
    if (
      typeof read !== 'object' ||
      read === null ||
      !('principal' in read) ||
      typeof read.principal !== 'string' ||
      !('tenant' in read) ||
      typeof read.tenant !== 'string'
    )
      throw new Error('invalid remote access')
    const tenant = tenantCodec.parse(read.tenant)
    if (!tenant.ok) throw new Error('invalid remote tenant')
    return { principal: read.principal, tenant: tenant.value }
  }
  const state = async (value: Parameters<typeof encodeCompactionTaskState>[0]) =>
    ok(decodeCompactionTaskState(await round('state', ok(encodeCompactionTaskState(value)))))
  const remote: ContextCompaction<string> = {
    async admit(input) {
      if (lose === 'admit-unapplied' && !disconnected) {
        disconnected = true
        return fail({
          kind: 'commit-unknown',
          ref: input.request.ref,
          operation: 'remote-admission',
        })
      }
      const request = ok(
        decodeCompactionRequest(await round('admit', ok(encodeCompactionRequest(input.request)))),
      )
      const answer = await service.admit({ ...access(input), request })
      if (lose === 'admit' && !disconnected && 'ok' in answer) {
        disconnected = true
        return fail({
          kind: 'commit-unknown',
          ref: input.request.ref,
          operation: 'remote-admission',
        })
      }
      return 'failure' in answer ? answer : succeed(await state(answer.ok))
    },
    async inspect(input) {
      const ref = ok(
        decodeCompactionTaskRef(await round('inspect', ok(encodeCompactionTaskRef(input.ref)))),
      )
      const answer = await service.inspect({ ...access(input), ref })
      return 'failure' in answer || answer.ok.kind === 'missing'
        ? answer
        : succeed({ kind: 'found', state: await state(answer.ok.state) })
    },
    async cancel(input) {
      const ref = ok(
        decodeCompactionTaskRef(await round('cancel', ok(encodeCompactionTaskRef(input.ref)))),
      )
      const operation = ok(
        decodeCompactionOperationId(
          JSON.parse(await round('operation', JSON.stringify(input.operation))),
        ),
      )
      const answer = await service.cancel({ ...access(input), ref, operation })
      return 'failure' in answer ? answer : succeed(await state(answer.ok))
    },
    async acknowledge(input) {
      if (lose === 'acknowledge-unapplied' && !disconnected) {
        disconnected = true
        return fail({ kind: 'commit-unknown', ref: input.ref, operation: input.operation })
      }
      const ref = ok(
        decodeCompactionTaskRef(await round('acknowledge', ok(encodeCompactionTaskRef(input.ref)))),
      )
      const operation = ok(
        decodeCompactionOperationId(
          JSON.parse(await round('operation', JSON.stringify(input.operation))),
        ),
      )
      const handoff = ok(
        decodeCompactionHandoff(await round('handoff', JSON.stringify(input.handoff))),
      )
      const answer = await service.acknowledge({
        ...access(input),
        ref,
        operation,
        handoff,
        result: JSON.parse(await round('result', JSON.stringify(input.result))),
      })
      if (lose === 'acknowledge' && !disconnected && 'ok' in answer) {
        disconnected = true
        return fail({ kind: 'commit-unknown', ref: input.ref, operation: input.operation })
      }
      return 'failure' in answer
        ? answer
        : succeed({
            ref: ok(
              decodeCompactionTaskRef(
                await round('ack-ref', ok(encodeCompactionTaskRef(answer.ok.ref))),
              ),
            ),
            result: JSON.parse(await round('ack-result', JSON.stringify(answer.ok.result))),
            receipt: JSON.parse(await round('receipt', JSON.stringify(answer.ok.receipt))),
          })
    },
  }
  return { remote, calls, lost: () => disconnected }
}
