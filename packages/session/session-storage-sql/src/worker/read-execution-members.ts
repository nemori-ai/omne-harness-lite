import { EXECUTION_FACT_MAX_BYTES } from '../codec.ts'
import { executionProjectionHead } from './execution-projection-head.ts'
import { big, handler, packed, rowsOf, scopeOf, text } from './support.ts'

const boundedKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value !== '' &&
  new TextEncoder().encode(value).length <= 2 * EXECUTION_FACT_MAX_BYTES + 64

function selection(input: Readonly<Record<string, unknown>>) {
  const { keys, member, reference, after } = input
  if (keys !== undefined) {
    if (
      member !== undefined ||
      reference !== undefined ||
      !Array.isArray(keys) ||
      keys.length < 1 ||
      keys.length > 64 ||
      new Set(keys).size !== keys.length ||
      !keys.every(boundedKey)
    )
      throw new Error('invalid member keys')
    return {
      where: `path IN (${keys.map(() => '?').join(', ')})`,
      parameters: keys,
      limit: keys.length,
      paged: false,
    }
  }
  if ((member !== 'requests' && member !== 'bindings') || !boundedKey(reference))
    throw new Error('invalid member reference')
  const prefix = JSON.stringify([member, `${JSON.stringify([reference]).slice(0, -1)},`]).slice(
    0,
    -2,
  )
  if (!boundedKey(prefix) || !(after === null || (boundedKey(after) && after.startsWith(prefix))))
    throw new Error('invalid member cursor')
  // The encoded tuple prefix ends with an ASCII comma; its successor bounds this identity alone.
  return {
    where: 'path >= ? AND path < ? AND path > ?',
    parameters: [prefix, `${prefix.slice(0, -1)}-`, after ?? ''],
    limit: 65,
    paged: true,
  }
}

export default handler('execution-record.members', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid member scope')
  const request = input as Readonly<Record<string, unknown>>
  const { execution } = request
  if (typeof execution !== 'string' || execution === '') throw new Error('invalid member execution')
  const selected = selection(request)
  const head = executionProjectionHead(port, scope, execution)
  if (head.kind !== 'ready') return head
  const rows = rowsOf(
    port,
    `SELECT path, value, active FROM er_current
    WHERE tenant = ? AND execution = ? AND session = ? AND ${selected.where} ORDER BY path LIMIT ?`,
    [scope.tenant, execution, scope.session, ...selected.parameters, selected.limit],
  )
  const page = selected.paged ? rows.slice(0, 64) : rows
  return {
    ...head,
    kind: 'members',
    next: selected.paged && rows.length > 64 ? text(page.at(-1)!['path']) : null,
    rows: page.map(row => ({
      key: text(row['path']),
      value: packed(row['value']),
      active: big(row['active']) === 1n,
    })),
  }
})
