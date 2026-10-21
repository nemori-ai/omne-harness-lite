import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  projectToolResult,
  readToolInvocationRef,
  type ResultPage,
  type ToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolMessageContentBlock,
  type ToolResult,
  type ToolState,
} from '@omne-harness/tool-contract'
import { createDemo, type Demo } from '../tests/example-assembly.ts'
import { evidence, valueOf } from './report-tool.ts'

type View = readonly ToolMessageContentBlock[]
type Settled = Extract<ToolState, { phase: 'settled' }>

function textOf(view: View): string {
  return view.flatMap(block => (block.kind === 'text' ? [block.text] : [])).join('\n')
}

function visibleField(view: View, name: string): string {
  const row = textOf(view)
    .split('\n')
    .find(line => line.slice(0, line.indexOf(':')).trim() === name)
  if (row === undefined) throw new Error(`Missing model-visible ${name}`)
  return row.slice(row.indexOf(':') + 1).trim()
}

// This consumer receives only P14 blocks and the actual help reply. It has no runtime or ledger.
function modelContinuation(help: View, view: View) {
  assert.ok(textOf(help).includes('read_result'))
  assert.ok(textOf(help).includes('next=null'))
  assert.equal(visibleField(view, 'reading'), 'success')
  const reference = visibleField(view, 'reference')
  const next = visibleField(view, 'next')
  if (next === 'null') {
    assert.equal(visibleField(view, 'content'), 'end')
    return null
  }
  return { kind: 'result', reference, after: next }
}

function project(value: ToolResult<ToolMessageContentBlock>): View {
  // This tutorial has no attachments, so P14 needs no additional attachment block identities.
  return valueOf(projectToolResult(value, []))
}

async function accepted(demo: Demo, answer: ToolInvokeOutcome): Promise<ToolInvocationRef> {
  switch (answer.kind) {
    case 'accepted':
      console.log(
        'invoke',
        JSON.stringify({
          kind: answer.kind,
          phase: answer.state.phase,
          reference: answer.reference,
        }),
      )
      return answer.reference
    case 'commit-unknown': {
      const lookup = await demo.runtime.queries.lookup({
        ...demo.access,
        reference: answer.reference,
      })
      throw new Error(
        `invoke unknown; retain original reference and fixed request: ${JSON.stringify({ answer, lookup })}`,
      )
    }
    case 'association-unknown':
      throw new Error(
        'Association unknown; retain the original request and complete consumer. Reconcile that same intent; do not allocate a new position.',
      )
    case 'rejected':
      throw new Error(`invoke rejected: ${JSON.stringify(answer.failure)}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

async function settle(demo: Demo, reference: ToolInvocationRef): Promise<Settled> {
  for (let step = 0; step < 100; step += 1) {
    const found = valueOf(await demo.runtime.queries.lookup({ ...demo.access, reference }))
    if (found.kind === 'found' && found.state.phase === 'settled') {
      // Queue repair is separate from settlement. Give scheduled work its remaining turns.
      if (found.state.queue.kind === 'released' || found.state.queue.kind === 'none')
        return found.state
    }
    await demo.advance()
  }
  throw new Error(
    `Bounded host advancement ended; retain and query original reference ${reference}`,
  )
}

async function scenario(name: string, run: (demo: Demo) => Promise<void>) {
  const demo = createDemo()
  const errors: unknown[] = []
  console.log(`\nSCENARIO ${name}`)
  try {
    await run(demo)
  } catch (error: unknown) {
    errors.push(error)
  }
  try {
    await demo.close()
  } catch (error: unknown) {
    errors.push(error)
  }
  if (errors.length > 0) throw new AggregateError(errors, `${name} failed (including cleanup)`)
  console.log(`PASS ${name}; tutorial host closed`)
}

// The consumer owns these records. Each record contains the complete text it actually processed.
// They are in-memory evidence for this tutorial, not a durable consumer-completion service.
const processed = new Map<
  string,
  Readonly<{ reference: ToolInvocationRef; result: string; delivery: string; text: string }>
>()

async function processAndRelease(
  demo: Demo,
  reference: ToolInvocationRef,
  state: Settled,
  text: string,
) {
  const delivery = state.delivery
  assert.ok(delivery !== null && delivery.kind === 'pending')
  const record = `processed-${processed.size + 1}`
  const completed = { reference, result: state.result, delivery: delivery.delivery, text }
  processed.set(record, completed)
  console.log(
    'processed',
    JSON.stringify({ record, result: state.result, characters: text.length }),
  )
  const released = await demo.runtime.commands.releaseDelivery({
    ...demo.access,
    reference,
    result: state.result,
    delivery: delivery.delivery,
    consumer: delivery.consumer,
    evidence: {
      kind: 'processed',
      completion: evidence(record, completed, delivery.consumer.owner),
    },
  })
  switch (released.kind) {
    case 'released':
      assert.equal(released.receipt.delivery, delivery.delivery)
      console.log('releaseDelivery', JSON.stringify({ kind: released.kind, record }))
      break
    case 'commit-unknown': {
      const query = await demo.runtime.queries.queryOperation({
        ...demo.access,
        operation: released.operation,
      })
      throw new Error(
        `Delivery release unknown; retain completion and original operation: ${JSON.stringify({ released, query })}`,
      )
    }
    case 'rejected':
      throw new Error(`Delivery release rejected: ${JSON.stringify(released.failure)}`)
    default: {
      const exhaustive: never = released
      throw new Error(JSON.stringify(exhaustive))
    }
  }
  const after = valueOf(await demo.runtime.queries.lookup({ ...demo.access, reference }))
  assert.ok(after.kind === 'found' && after.state.delivery?.kind === 'released')
  // Handoff does not delete the fixed result.
  valueOf(
    await demo.runtime.queries.readResult({
      ...demo.access,
      reference,
      result: state.result,
      after: null,
    }),
  )
}

async function successfulReport(demo: Demo) {
  // Save the fixed request and full consumer before invoking. This identity is also the recovery key.
  const originalRequest = demo.request('source-report', null, '{}')
  const reference = await accepted(
    demo,
    await demo.runtime.invoke({ ...demo.access, request: originalRequest }),
  )
  const state = await settle(demo, reference)
  assert.equal(state.terminal.kind, 'completed')
  assert.equal(state.queue.kind, 'released')
  assert.equal(state.delivery?.kind, 'pending')
  console.log(
    'lookup',
    JSON.stringify({
      phase: state.phase,
      terminal: state.terminal,
      queue: state.queue.kind,
      delivery: state.delivery?.kind,
    }),
  )
  console.log('slot released; source delivery remains pending')

  let metaPosition = 0
  async function meta(command: 'help' | 'read_result', args: object) {
    const position = `meta-message-${++metaPosition}`
    const request = demo.request(position, command, JSON.stringify(args))
    console.log('Tools command', JSON.stringify({ command, position, arguments: args }))
    const metaReference = await accepted(
      demo,
      await demo.runtime.invoke({ ...demo.access, request }),
    )
    const metaState = await settle(demo, metaReference)
    // Host-only: collect the whole NEW meta result before P14 projection. The model never reads cursors here.
    const reply = valueOf(
      await demo.tools.readReply({
        ...demo.access,
        reference: metaReference,
        result: metaState.result,
      }),
    )
    const view = project(reply)
    console.log(
      'new ToolResult',
      JSON.stringify({ position, reference: metaReference, result: metaState.result }),
    )
    console.log(textOf(view))
    await processAndRelease(demo, metaReference, metaState, textOf(view))
    return view
  }

  const help = await meta('help', { command: 'read_result' })
  let view = project(await demo.tools.present({ ...demo.access, reference, result: state.result }))
  console.log('source first ToolResult projection')
  console.log(textOf(view))
  const reportText: string[] = []
  const seen = new Set<string>()
  let pages = 0
  for (;;) {
    // Processing here means extracting every visible report section in order into the consumer record.
    reportText.push(
      ...view.flatMap(block =>
        block.kind === 'text' && block.id.startsWith('report-') ? [block.text] : [],
      ),
    )
    pages += 1
    const next = modelContinuation(help, view)
    if (next === null) break
    if (pages >= 20 || seen.has(next.after))
      throw new Error('Model continuation did not make progress')
    seen.add(next.after)
    view = await meta('read_result', next)
  }
  assert.ok(pages >= 2)
  assert.equal(reportText.length, 3)
  assert.ok(reportText.every((text, index) => text.startsWith(`Report section ${index + 1}:`)))
  assert.equal(demo.report.executions(), 1)
  await processAndRelease(demo, reference, state, reportText.join('\n\n'))
  console.log(
    'source summary',
    JSON.stringify({
      pages,
      sections: reportText.length,
      sourceExecutions: demo.report.executions(),
      next: null,
    }),
  )
}

// Host reads of original failure results use the ordinary query, not the meta-reply collector.
async function readOriginal(
  demo: Demo,
  reference: ToolInvocationRef,
  state: Settled,
): Promise<string> {
  let after: string | null = null
  const seen = new Set<string>()
  const texts: string[] = []
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page: ResultPage<ContentBlock> = valueOf(
      await demo.runtime.queries.readResult({
        ...demo.access,
        reference,
        result: state.result,
        after,
      }),
    )
    assert.equal(page.result, state.result)
    texts.push(textOf(valueOf(projectToolResult(page.value, []))))
    if (page.next === null) return texts.join('\n')
    if (seen.has(page.next)) throw new Error('Original result cursor did not advance')
    seen.add(page.next)
    after = page.next
  }
  throw new Error('Original result exceeded the tutorial page limit')
}

async function argumentsFailure(demo: Demo) {
  // The request envelope is valid and complete. Strict JSON rejects duplicate keys as arguments failure.
  const request = demo.request('invalid-arguments', null, '{"topic":"first","topic":"second"}')
  const reference = await accepted(demo, await demo.runtime.invoke({ ...demo.access, request }))
  const state = await settle(demo, reference)
  assert.ok(state.terminal.kind === 'failed' && state.terminal.cause === 'arguments')
  assert.deepEqual(demo.counts(), { preparations: 0, startCalls: 0, executions: 0 })
  const text = await readOriginal(demo, reference, state)
  console.log(
    'arguments failure',
    JSON.stringify({ terminal: state.terminal, counts: demo.counts(), text }),
  )
  await processAndRelease(demo, reference, state, text)
}

async function excludedStart(demo: Demo) {
  const request = demo.request('excluded-start', null, '{}')
  const reference = await accepted(demo, await demo.runtime.invoke({ ...demo.access, request }))
  const operation = valueOf(await demo.identities.operationIdentities.newOperation())
  const { call } = readToolInvocationRef(reference)
  // The coordinator owns authority. It has checked the same principal and tenant, and has not advanced the driver.
  // Only confirmed exclusion proves this call cannot start. An unknown reply must keep this identity pending.
  const excluded = await demo.test.doubles.authority.exclude({
    ...demo.access,
    call,
    operation,
    reason: 'Tutorial coordinator excluded this call before start',
  })
  if ('failure' in excluded)
    throw new Error(
      `Start exclusion not confirmed; retain ${operation}: ${JSON.stringify(excluded.failure)}`,
    )
  console.log(
    'authority.exclude confirmed',
    JSON.stringify({ call, operation, evidence: excluded.ok }),
  )
  const state = await settle(demo, reference)
  assert.equal(state.terminal.kind, 'unavailable')
  assert.equal(state.effect.kind, 'not-started')
  assert.equal(state.execution.kind, 'not-started')
  assert.equal(state.queue.kind, 'released')
  assert.equal(demo.counts().startCalls, 0)
  assert.equal(demo.report.executions(), 0)
  const text = await readOriginal(demo, reference, state)
  console.log(
    'start excluded',
    JSON.stringify({
      terminal: state.terminal,
      effect: state.effect,
      queue: state.queue.kind,
      counts: demo.counts(),
      text,
    }),
  )
  await processAndRelease(demo, reference, state, text)
}

try {
  await scenario('success with model-visible pagination', successfulReport)
  await scenario('complete arguments failure', argumentsFailure)
  await scenario('confirmed pre-start exclusion', excludedStart)
  console.log(
    `All tutorial journeys completed; ${processed.size} consumer processing records retained in this process.`,
  )
} catch (error: unknown) {
  console.error(error)
  process.exitCode = 1
}
