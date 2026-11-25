import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  isTenantShape,
  type CallRecord,
  type ToolSourceGuard,
} from '@omne-harness/tool'
import type { Access, FixedToolRequest, Reply, ToolCallId } from '@omne-harness/tool-contract'
import {
  fixedRequestReference,
  type ProgramParent,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import type { LocalInvocationSourceInput } from './invocation-source.ts'

/** What makes a started call the parent of calls it issues: who may be one, and which of its calls. */
export type ParentRole<P> = Readonly<{
  authority(): ToolStartAuthority<P> | undefined
  isParent(request: FixedToolRequest): boolean
}>

const same = (a: unknown, b: unknown) => canonicalDigest(a) === canonicalDigest(b)
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'invocation-source',
    diagnostic: 'The original parent of the call cannot be verified.',
  })
const denied = () => fail({ kind: 'denied' as const, action: 'admit' })

export function createParentChecks<P>(
  input: Pick<LocalInvocationSourceInput<P>, 'store' | 'authority'>,
  directGuard: ToolSourceGuard<P>,
) {
  const readParent = async (access: Access<P> & { call: ToolCallId }): Reply<CallRecord> => {
    if (!isTenantShape(access.tenant)) return denied()
    const read = await input.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
    if (read.kind !== 'complete') return unavailable()
    const row = read.records.find(row => row.kind === 'call')
    return row?.kind === 'call' &&
      row.call.call === access.call &&
      same(row.call.tenant, access.tenant)
      ? succeed(row.call)
      : denied()
  }
  /** The parent is the call it says it is, has really started, came from a trusted source and may issue. */
  const checkParent = async (
    parent: ProgramParent<P>,
    role: ParentRole<P> | undefined,
    accepts: (row: CallRecord) => boolean = () => true,
  ): Reply<CallRecord> => {
    const read = await readParent(parent)
    if ('failure' in read) return read
    const row = read.ok
    if (
      row.start === null ||
      !same(row.start, parent.start) ||
      !same(fixedRequestReference(row.request), fixedRequestReference(parent.request)) ||
      !same(row.start.execution.tenant, parent.tenant) ||
      row.start.execution.call !== parent.call ||
      !accepts(row)
    )
      return denied()
    if (role === undefined) return unavailable()
    if (!role.isParent(row.request)) return denied()
    const authority = role.authority()
    if (authority === undefined) return unavailable()
    const started = await authority.inspect({ ...parent, start: row.start })
    if ('failure' in started) return started
    if (started.ok.kind !== 'started') return unavailable()
    const source = await directGuard.verify({
      ...parent,
      operation: row.admission,
      request: row.request,
    })
    if (source.kind === 'forged' || source.kind === 'denied') return denied()
    if (source.kind !== 'trusted') return unavailable()
    const qualified = await input.authority.qualify({ ...parent, consumer: row.request.consumer })
    if (qualified.kind === 'denied') return denied()
    return qualified.kind === 'allowed' ? succeed(row) : unavailable()
  }
  return { readParent, checkParent }
}
