import type { ParticipantModule } from '@omne-harness/sql-contract/worker'

const tasks: ParticipantModule = {
  participant: 'context.compaction.tasks',
  protocol: '1',
  execute(facts, port) {
    if (facts.kind === 'content') {
      const { tenant, digest, part, payload } = facts
      if (
        typeof tenant !== 'string' ||
        typeof digest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(digest) ||
        typeof part !== 'number' ||
        !Number.isSafeInteger(part) ||
        part < 0 ||
        typeof payload !== 'string' ||
        payload.length > 43_692
      )
        return { kind: 'failed', diagnostic: 'invalid content chunk' }
      const prior = port.execute(
        'SELECT payload FROM cc_content WHERE tenant = ? AND digest = ? AND part = ?',
        [tenant, digest, part],
      ).rows[0]
      if (prior !== undefined && prior[0] !== payload)
        return { kind: 'conflict', basis: { digest, part } }
      if (prior === undefined)
        port.execute('INSERT INTO cc_content(tenant, digest, part, payload) VALUES (?, ?, ?, ?)', [
          tenant,
          digest,
          part,
          payload,
        ])
      return { kind: 'participated', response: { digest, part } }
    }
    const { key, authority, tenant, task, digest, expected, revision, live, reference, record } =
      facts
    if (
      typeof key !== 'string' ||
      typeof authority !== 'string' ||
      typeof tenant !== 'string' ||
      typeof task !== 'string' ||
      typeof digest !== 'string' ||
      typeof revision !== 'string' ||
      typeof reference !== 'string' ||
      typeof record !== 'string' ||
      typeof live !== 'boolean' ||
      (expected !== null && typeof expected !== 'string')
    )
      return { kind: 'failed', diagnostic: 'invalid task change' }
    const old = port.execute('SELECT revision, request_digest FROM cc_task WHERE task_key = ?', [
      key,
    ]).rows[0]
    if ((old?.[0] ?? null) !== expected || (old !== undefined && old[1] !== digest))
      return { kind: 'conflict', basis: { revision: typeof old?.[0] === 'string' ? old[0] : null } }
    port.execute(
      `INSERT INTO cc_task(task_key, authority, tenant, task, request_digest, revision, live, reference, record)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_key) DO UPDATE SET revision = excluded.revision, live = excluded.live,
      reference = excluded.reference, record = excluded.record`,
      [key, authority, tenant, task, digest, revision, live, reference, record],
    )
    return { kind: 'participated', response: { revision } }
  },
}
export default tasks
