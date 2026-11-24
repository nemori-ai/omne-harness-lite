import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import { execution, loadWithEntries, ok, type Principal } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import {
  associatedTools,
  deliverToolSuggestion,
  pushToolResult,
  toolAssembly,
  toolCall,
  toolPlaceholder,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
const input = { ...alice, execution: execution() }

function accepted(name: string): ToolInvokeOutcome {
  const reference = ok(
    encodeToolInvocationRef({
      tenant: alice.tenant,
      call: ok(decodeToolCallId(`tcall_${name}`)),
      admission: ok(decodeToolOperationId(`top_${name}`)),
    }),
  )
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

// Two background calls whose placeholders arrive one at a time, the later action's first; the
// earlier action's placeholder is pushed while the first commit of `node` after that is on its way
// to the Journal.
async function outOfOrder(node: 'W0' | 'T1') {
  let inject: (() => Promise<void>) | null = null
  let seen = 0
  let armedAt = Number.POSITIVE_INFINITY
  const wrap = (d: Dependencies): Dependencies => ({
    ...d,
    journal: {
      ...d.journal,
      async commit(commit) {
        if (commit.operation.startsWith(`${node}/`)) {
          seen += 1
          const run = seen > armedAt ? inject : null
          if (run !== null) {
            inject = null
            await run()
          }
        }
        return d.journal.commit(commit)
      },
    },
  })
  const assembly = await toolAssembly({}, {}, {}, wrap)
  let made = 0
  assembly.controls.tools.invoke.always(async () => {
    made += 1
    return accepted(`call-${String(made)}`)
  })
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly, [toolCall('tool-call-a'), toolCall('tool-call-b')])
  const [first, second] = await associatedTools(assembly, 2)
  if (first === undefined || second === undefined) throw new Error('two associated Tool calls')
  const receiver = toolReceiver(assembly)
  await eventually(
    async () => (await loadWithEntries(assembly.dependencies, input)).state.kind === 'waiting',
  )
  inject = async () => {
    expect(await pushToolResult(receiver, toolPlaceholder(first))).toHaveProperty('ok')
  }
  armedAt = seen
  expect(await pushToolResult(receiver, toolPlaceholder(second))).toHaveProperty('ok')
  await eventually(async () =>
    (await loadWithEntries(assembly.dependencies, input)).checkpoint.calls.some(
      call => call.kind === 'model' && call.action.startsWith('step-2/'),
    ),
  )
  return { assembly, injected: inject === null }
}

describe('a placeholder that arrives while the loop is about to wait is taken, not waited on', () => {
  it('pushed while the wait is being saved: the save meets the change and the loop reads again', async () => {
    const { injected } = await outOfOrder('W0')
    expect(injected).toBe(true)
  })

  it('pushed while the batch keeps the later placeholder: the loop reads the earlier one before it waits', async () => {
    const { injected } = await outOfOrder('T1')
    expect(injected).toBe(true)
  })
})
