import type { AgentJournal, Authority, CommandReceipt } from '@omne-harness/agent-contract'
import type { ContextTarget } from '@omne-harness/request-context-contract'
import { operationId } from '@omne-harness/session-contract/testing'
import { invocation, m0Checkpoint, type FixedValues } from './adopted-request.ts'
import { ok, operation } from './common-journal.ts'
import { endOpened, refusedByModel } from './finish.ts'
import { handed, type SqlScene } from './sql-scene.ts'

type Opened = Readonly<{ receipt: CommandReceipt; authority: Authority }>

// A later Run names itself and takes every input waiting: a failed Run gives its input back.
export async function openHanded(
  s: SqlScene,
  journal: AgentJournal<string>,
  run?: string,
): Promise<Opened> {
  const opened = ok(await journal.open(s.openInput))
  if (run === undefined) {
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    return opened
  }
  const work = ok(await s.port.readWork(s.sessionAccess))
  for (const input of work.pending.filter(item => !work.handed.includes(item)))
    ok(
      await s.port.commit({
        access: s.sessionAccess,
        command: {
          kind: 'receive',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: operationId(`handed-${String(input)}-run-${run}`),
            fact: {
              kind: 'input-handover',
              input,
              execution: s.execution,
              result: { kind: 'accepted', receipt: opened.receipt.evidence },
            },
          },
        },
        guards: [],
      }),
    )
  return opened
}

/** Saves an M0 adopting a request for the model call `tag`, with the record bytes of `bytesOf`. */
export async function adopt(
  s: SqlScene,
  journal: AgentJournal<string>,
  opened: Opened,
  target: ContextTarget,
  tag: string,
  values: FixedValues & Readonly<{ bytesOf?: string }> = {},
) {
  const made = m0Checkpoint(target, values.bytesOf ?? tag, values)
  const adoptedRequest = {
    ...made.adoptedRequest,
    reference: invocation(target.tenant, tag) as never,
    fixed: { ...made.adoptedRequest.fixed, record: `preparation/${tag}` },
  }
  const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
  ok(
    await journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`m0-${tag}`),
      authority: opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, adoptedRequest, adoptedContext: made.adoptedContext },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  return made.record
}

export async function endAndSettle(s: SqlScene, journal: AgentJournal<string>, opened: Opened) {
  await endOpened(s, journal, opened, refusedByModel())
  await settleEnded(s, journal)
}

/** Acknowledges all an ended execution emitted: the Agent side settles it. */
export async function settleEnded(s: SqlScene, journal: AgentJournal<string>) {
  const through = ok(await journal.load({ ...s.access, execution: s.execution })).output
    .emittedThrough
  if (through === null) throw new Error('the ended execution emitted nothing')
  ok(
    await journal.acknowledge({
      ...s.access,
      execution: s.execution,
      operation: operation('acknowledge-all'),
      through,
      receipt: null,
    }),
  )
  const settled = s.controls?.select(
    `SELECT settled FROM er_execution WHERE execution = '${s.execution}'`,
  ).rows[0]?.[0]
  if (settled === null || settled === undefined) throw new Error('the execution did not settle')
}
