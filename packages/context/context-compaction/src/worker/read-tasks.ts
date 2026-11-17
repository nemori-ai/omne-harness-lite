import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'

const handler: ReadHandlerModule = {
  handler: 'context.compaction.tasks.read',
  protocol: '1',
  read(input, port) {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      return { kind: 'failed', diagnostic: 'invalid read' }
    if (
      'content' in input &&
      typeof input.content === 'string' &&
      typeof input.tenant === 'string' &&
      typeof input.after === 'number' &&
      Number.isSafeInteger(input.after) &&
      input.after >= 0 &&
      typeof input.limit === 'number' &&
      Number.isSafeInteger(input.limit) &&
      input.limit > 0 &&
      input.limit <= 16
    ) {
      const rows = port.execute(
        'SELECT part, payload FROM cc_content WHERE tenant = ? AND digest = ? AND part >= ? ORDER BY part LIMIT ?',
        [input.tenant, input.content, input.after, input.limit],
      ).rows
      const chunks: { part: number; payload: string }[] = []
      for (const row of rows) {
        if (
          (typeof row[0] !== 'number' && typeof row[0] !== 'bigint') ||
          typeof row[1] !== 'string'
        )
          return { kind: 'failed', diagnostic: 'invalid content row' }
        const part = Number(row[0])
        if (!Number.isSafeInteger(part) || part < 0)
          return { kind: 'failed', diagnostic: 'invalid content index' }
        chunks.push({ part, payload: row[1] })
      }
      return { kind: 'read', output: chunks }
    }
    if ('key' in input && typeof input.key === 'string') {
      const row = port.execute('SELECT record FROM cc_task WHERE task_key = ? LIMIT 1', [input.key])
        .rows[0]
      return { kind: 'read', output: typeof row?.[0] === 'string' ? row[0] : null }
    }
    if (
      !('authority' in input) ||
      typeof input.authority !== 'string' ||
      !('after' in input) ||
      (input.after !== null && typeof input.after !== 'string') ||
      !('limit' in input) ||
      typeof input.limit !== 'number' ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      return { kind: 'failed', diagnostic: 'invalid pending page' }
    const rows = port.execute(
      `SELECT task_key, reference FROM cc_task
      WHERE authority = ? AND live = 1 AND task_key > ? ORDER BY task_key LIMIT ?`,
      [input.authority, input.after ?? '', input.limit + 1],
    ).rows
    const items: { key: string; reference: string }[] = []
    for (const row of rows) {
      if (typeof row[0] !== 'string' || typeof row[1] !== 'string')
        return { kind: 'failed', diagnostic: 'corrupt task index' }
      items.push({ key: row[0], reference: row[1] })
    }
    return { kind: 'read', output: items }
  },
}
export default handler
