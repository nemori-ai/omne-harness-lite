// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { WireEntry } from '../src/model/content.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  listed,
  listPage,
  messageEntry,
  page,
  plainEntry,
  snapshotTree,
  stateFrame,
  toolCallBlock,
  toolResultEntry,
  userEntry,
} from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const started = (id: string, revision: string) =>
  plainEntry(id, revision, 'run.started', { kind: 'run.started' })
const terminal = (id: string, revision: string, outcome: string) =>
  plainEntry(id, revision, 'run.terminal', { terminal: { run: 'run_1', outcome } })

const BEFORE = [
  userEntry('1', '1', '早'),
  started('2', '1'),
  assistantEntry('3', '1', '早上好'),
  terminal('4', '1', 'completed'),
]

async function opened(fake: FakeClient, client = fake.client) {
  const mounted = await mountModule(client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(BEFORE, '1') })
  await settle()
  return mounted
}

it('经形口报这个会话此刻在做什么，收到输入、一轮落定、一轮做不到时各报一次，序号随事实递增', async () => {
  const fake = createFakeClient()
  const { shell } = await opened(fake)
  const observation = fake.observations[0]!
  const last = () => shell.reports.at(-1)
  expect(shell.reports).toEqual([{ doing: 'idle' }])

  const log: WireEntry[] = [...BEFORE]
  async function step(run: string | null, revision: string, ...more: WireEntry[]) {
    act(() => observation.push(stateFrame(run, revision)))
    await settle()
    log.push(...more)
    ;(await fake.next('read-history')).answer({
      outcome: 'succeeded',
      body: page(log, revision),
    })
    await settle()
  }

  await step('run_1', '2', userEntry('5', '2', '再说一句'), started('6', '2'))
  const received = { kind: 'received', serial: 1 }
  expect(last()).toEqual({ doing: 'thinking', moment: received })

  const call = messageEntry('7', '3', 'assistant', [toolCallBlock('call_1', 'Shell', {})])
  await step('run_1', '3', call)
  expect(last()).toEqual({ doing: 'looking', moment: received })

  await step('run_1', '4', toolResultEntry('8', '4', 'call_1', 'ok'))
  expect(last()).toEqual({ doing: 'thinking', moment: received })

  act(() =>
    observation.push({
      kind: 'snapshot',
      projection: 'model-output-v1',
      value: snapshotTree('1', '4', [['0', '好']]),
    }),
  )
  await settle()
  expect(last()).toEqual({ doing: 'writing', moment: received })

  await step(null, '5', assistantEntry('9', '5', '好的'), terminal('10', '5', 'completed'))
  expect(last()).toEqual({ doing: 'idle', moment: { kind: 'landed', serial: 2 } })

  await step('run_2', '6', userEntry('11', '6', '再来'), started('12', '6'))
  expect(last()).toEqual({ doing: 'thinking', moment: { kind: 'received', serial: 3 } })

  await step(null, '7', terminal('13', '7', 'failed'))
  expect(last()).toEqual({ doing: 'idle', moment: { kind: 'could-not', serial: 4 } })
  expect(shell.reports.every(report => report.waiting === undefined)).toBe(true)
})

it('没有一轮在跑而这个会话还有调用在后台：报 background', async () => {
  const fake = createFakeClient()
  const calls = [
    {
      id: 'b1',
      producer: { kind: 'tool', call: 'ref-b1' },
      label: { intent: '构建', tool: 'Shell', command: 'execute', preview: '' },
      source: 'threshold',
      status: 'running',
      stop: null,
      lastLine: null,
    },
  ]
  const client = {
    ...fake.client,
    'list-background-calls': async () => ({ outcome: 'succeeded', body: { calls } }),
  } as unknown as FakeClient['client']
  const { shell } = await opened(fake, client)
  expect(shell.reports.at(-1)).toEqual({ doing: 'background' })
})
