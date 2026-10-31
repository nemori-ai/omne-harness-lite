import { scene, ok, operation, evidence, type SceneQualification } from './common-journal.ts'
import { toolCall } from './tool-call.ts'

export async function resultCall(
  name: string,
  qualification: SceneQualification = { agent: true, session: true },
) {
  const s = await scene(name, undefined, qualification),
    tool = toolCall(s.access.tenant, name)
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('original-pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, batch: tool.batch },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('result-custody'),
    consumption: tool.pending.consumption,
    result: tool.placeholder,
    release: { kind: 'pending' as const },
    transfer: {
      kind: 'custody' as const,
      consumption: tool.pending.consumption,
      result: tool.placeholder,
      retained: evidence('custody'),
    },
  }
  return { ...s, tool, request }
}
