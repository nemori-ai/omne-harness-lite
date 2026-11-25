import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { judgeMessage } from '@omne-harness/message'
import type { CommitRequestV2, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { createSessionLogJournal } from '../../src/cordis/agent-journal.ts'
import { openContextScope } from '../../src/cordis/model-reminder-commit.ts'
import { evidence, ok } from './common-journal.ts'
import { sqlScene } from './sql-scene.ts'

const [phase, standing, storageRoot] = process.argv.slice(2)
if (
  (phase !== 'a' && phase !== 'b') ||
  !storageRoot ||
  !['committed', 'not-submitted'].includes(standing ?? '')
)
  throw new Error('expected phase, standing, storageRoot')
const s = await sqlScene(`os-guidance-${standing}`, { storage: 'real', storageRoot })
try {
  if (phase === 'a') ok(await s.view.journal.open(s.openInput))
  const scope = openContextScope({ ...s.access, snapshot: ok(await s.port.readWork(s.access)) })
  if (!scope) throw new Error('missing scope')
  const judged = judgeMessage({
    role: 'system_reminder',
    id: 'msg_abcdefghijklmnopqrstuv',
    blocks: [
      {
        kind: 'text',
        id: 'blk_os_guidance',
        text: 'os-process-directory-guidance',
        visibility: { toModel: true, toHuman: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.role !== 'system_reminder') throw new Error('invalid message')
  const message = judged.ok
  const view = async () => {
    const page = ok(
      await s.port.history.readModelView({
        ...s.access,
        after: null,
        basis: null,
        pageBytes: 100000,
      }),
    )
    if (page.kind !== 'page') throw new Error('missing page')
    return page
  }
  let original: SqlIdentity | undefined
  const queried: SqlIdentity[] = []
  const storage: SqlStorage = {
    ...s.storage,
    commit: async request => {
      if (
        phase === 'a' &&
        !original &&
        JSON.stringify(request.commands).includes('os-process-directory-guidance')
      ) {
        original = request.identity
        await writeFile(join(storageRoot, 'delayed-original.json'), JSON.stringify(request))
        if (standing === 'committed') await s.storage.commit(request)
        return {
          kind: 'unknown',
          identity: request.identity,
          diagnostic: 'OS A lost reminder receipt',
        }
      }
      return s.storage.commit(request)
    },
    query: async identity => {
      queried.push(identity)
      return s.storage.query(identity)
    },
  }
  const journals = createSessionLogJournal({
    storage,
    combination: s.combination,
    reminders: {
      forget() {},
      prepare: async () => {
        const page = await view()
        return {
          ok: {
            messages: page.rows.some(row => row.message.id === message.id) ? [] : [message],
            viewRevision: '1',
            modelView: page.basis,
            advance() {},
          },
        }
      },
    },
    tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
    sessionAccessCheck: {
      check: async () => ({ kind: 'allowed', evidence: evidence('os-allowed') }),
    },
  })
  const answer = await journals.ensureModelHistory({ ...s.access, scope })
  if (phase === 'a') {
    if (!('failure' in answer) || !original)
      throw new Error('A must leave an uncertain original operation')
    console.log(
      'GUIDANCE_PROCESS ' +
        JSON.stringify({
          pid: process.pid,
          phase,
          standing,
          original,
          answer,
          rows: (await view()).rows.length,
        }),
    )
  } else {
    ok(answer)
    // Recovery has already finished without reading the delayed request or its identity.
    const beforeLate = (await view()).rows.filter(row => row.message.id === message.id).length
    const delayed = JSON.parse(
      await readFile(join(storageRoot, 'delayed-original.json'), 'utf8'),
    ) as CommitRequestV2
    const late = standing === 'not-submitted' ? await s.storage.commit(delayed) : null
    const afterLate = (await view()).rows.filter(row => row.message.id === message.id).length
    console.log(
      'GUIDANCE_PROCESS ' +
        JSON.stringify({ pid: process.pid, phase, standing, queried, beforeLate, afterLate, late }),
    )
  }
} finally {
  await s.close()
}
