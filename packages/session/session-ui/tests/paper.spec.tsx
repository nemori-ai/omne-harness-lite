// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { defineRenderPoint } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { afterEach, describe, expect, it } from 'vitest'
import {
  conversationTarget,
  createSessionUiModule,
  type PaperElementSubject,
  type PaperFrame,
  type PaperPickerSubject,
  type PaperReference,
  type SessionUiOptions,
} from '../src/cordis.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage } from './fixtures/frames.ts'
import { startShell, type TestShell } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const KIND = 'session.session'

// The canvas's two points as its interface declares them; the session interface never imports them.
const element = defineRenderPoint<PaperElementSubject>({
  name: 'canvas.element',
  key: 'the name of the kind',
  summary: 'How a thing of one kind is drawn on the canvas.',
  keysFrom: 'canvas.kinds',
})
const picker = defineRenderPoint<PaperPickerSubject>({
  name: 'canvas.picker',
  key: 'the name of the kind',
  summary: 'How a person picks one thing of a kind from the search.',
  keysFrom: 'canvas.kinds',
})

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const minutesAgo = (minutes: number): Instant => {
  const parsed = parseInstant(new Date(Date.now() - minutes * 60_000).toISOString())
  if (!parsed.ok) throw new Error('fixture instant')
  return parsed.value
}

async function mounted(
  given: Pick<SessionUiOptions, 'canvasElement' | 'canvasPicker'> = {
    canvasElement: element,
    canvasPicker: picker,
  },
): Promise<{ fake: FakeClient; shell: TestShell }> {
  const fake = createFakeClient()
  const { root, shell } = await startShell()
  element.declare(shell)
  picker.declare(shell)
  await serveProtocol(root, sessionProtocol, fake.client)
  await root.plugin(createSessionUiModule(given))
  shell.tenant = TENANT
  return { fake, shell }
}

function drawOn(shell: TestShell, session: string, frame: PaperFrame = 'sheet') {
  const subject = { reference: { kind: KIND, ref: session }, frame }
  return render(
    <div>
      {element.draw(shell, KIND, subject, () => (
        <p>通用的一页</p>
      ))}
    </div>,
  )
}

function pickIn(shell: TestShell, query: string) {
  const picked: PaperReference[] = []
  const view = render(
    <div>
      {picker.draw(shell, KIND, { query, pick: reference => picked.push(reference) }, () => null)}
    </div>,
  )
  return { picked, view }
}

describe('a session on the paper', () => {
  it('draws the title, the age of its last activity and no word for a normal state', async () => {
    const { fake, shell } = await mounted()
    const { container } = drawOn(shell, 'ses_a')
    ;(await fake.next('list-sessions')).answer(
      listPage([{ ...listed('ses_a', '周报', 'dormant'), lastActivityAt: minutesAgo(3) }]),
    )
    await settle()
    const item = screen.getByRole('button')
    expect(item.getAttribute('data-omne-part')).toBe('session.paper.item')
    expect(item.querySelector('.omne-session-item-title')?.textContent).toBe('周报')
    expect(item.querySelector('time')?.textContent).toMatch(/3 分钟前/u)
    expect(container.textContent).not.toMatch(/空闲|休眠|正在初始化|已冻结/u)
  })

  it('names an untitled session as the list does, and says a state that is not normal', async () => {
    const { fake, shell } = await mounted()
    drawOn(shell, 'ses_0123456789')
    drawOn(shell, 'ses_frozen')
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_0123456789'), listed('ses_frozen', '冻住的', 'frozen')]),
    )
    await settle()
    const [untitled, frozen] = screen.getAllByRole('button')
    expect(untitled?.textContent).toBe('未命名的会话 ses_0123')
    expect(frozen?.textContent).toBe('冻住的已冻结')
  })

  it('reads on through the open directory until it finds the row', async () => {
    const { fake, shell } = await mounted()
    drawOn(shell, 'ses_late')
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')], 'c-2'))
    await settle()
    const more = await fake.next('list-sessions')
    expect(more.body).toMatchObject({ cursor: 'c-2' })
    more.answer(listPage([listed('ses_late', '晚些的')]))
    await settle()
    expect(screen.getByRole('button').textContent).toBe('晚些的')
  })

  it('finds an archived session in the archived directory and says it is archived', async () => {
    const { fake, shell } = await mounted()
    drawOn(shell, 'ses_old')
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    const archived = await fake.next('list-archived-sessions')
    expect(archived.body).toMatchObject({ cursor: null })
    archived.answer({
      outcome: 'succeeded',
      body: {
        sessions: [{ ...listed('ses_old', '旧的'), archivedAt: null, archivedBy: 'person' }],
        next: null,
        completeness: 'complete',
      },
    })
    await settle()
    expect(screen.getByRole('button').textContent).toBe('旧的已归档')
  })

  it('says one sentence when the row is in neither directory, and the same when reading is refused', async () => {
    const missing = await mounted()
    drawOn(missing.shell, 'ses_gone')
    ;(await missing.fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    ;(await missing.fake.next('list-archived-sessions')).answer({
      outcome: 'succeeded',
      body: { sessions: [], next: null, completeness: 'complete' },
    })
    await settle()
    const sentence = '读不到这个会话：它不在了，或你没有权限看。'
    expect(screen.getByText(sentence)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    const refused = await mounted()
    drawOn(refused.shell, 'ses_theirs')
    ;(await refused.fake.next('list-sessions')).answer({ outcome: 'denied' })
    await settle()
    expect(screen.getByText(sentence)).toBeTruthy()
  })

  it('says it cannot read now when the session protocol does not answer', async () => {
    const { fake, shell } = await mounted()
    drawOn(shell, 'ses_a')
    ;(await fake.next('list-sessions')).answer({ outcome: 'unavailable' })
    await settle()
    expect(screen.getByText('现在读不到这个会话。')).toBeTruthy()
    expect(screen.queryByText('通用的一页')).toBeNull()
  })

  it('is a page on the sheet and in a pile, and a plain line in the search', async () => {
    const { fake, shell } = await mounted()
    const frames = (['sheet', 'pile', 'search'] as const).map(frame =>
      drawOn(shell, 'ses_a', frame),
    )
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    const drawn = frames.map(({ container }) =>
      container.querySelector('[data-omne-part="session.paper.item"]'),
    )
    expect(drawn.map(node => [node?.tagName, node?.getAttribute('data-frame')])).toEqual([
      ['BUTTON', 'sheet'],
      ['BUTTON', 'pile'],
      ['DIV', 'search'],
    ])
  })

  it('opens the session on the conversation page with the subject the jump is written in', async () => {
    const { fake, shell } = await mounted()
    drawOn(shell, 'ses_a', 'pile')
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '甲' }))
    const target = conversationTarget('ses_a')
    expect(shell.navigated).toEqual([target.page])
    expect(shell.subjects).toEqual([target.subject])
  })
})

describe('picking a session in the search', () => {
  const rows = (view: ReturnType<typeof render>) =>
    within(view.container)
      .queryAllByRole('button')
      .map(button => button.querySelector('.omne-session-item-title')?.textContent)

  it('finds the open sessions whose names hold the words, whatever their case', async () => {
    const { fake, shell } = await mounted()
    const { view } = pickIn(shell, '  周报 ')
    const { view: upper } = pickIn(shell, 'WEEKLY')
    ;(await fake.next('list-sessions')).answer(
      listPage([
        listed('ses_a', '第三周周报'),
        listed('ses_b', '旅行'),
        listed('ses_c', 'Weekly 周报'),
      ]),
    )
    await settle()
    expect(rows(view)).toEqual(['第三周周报', 'Weekly 周报'])
    expect(rows(upper)).toEqual(['Weekly 周报'])
  })

  it('without words lists the latest few, latest first', async () => {
    const { fake, shell } = await mounted()
    const { view } = pickIn(shell, '')
    const sessions = Array.from({ length: 8 }, (_, at) => ({
      ...listed(`ses_${String(at)}`, `第 ${String(at)} 个`),
      lastActivityAt: minutesAgo(at + 1),
    }))
    ;(await fake.next('list-sessions')).answer(listPage(sessions.toReversed()))
    await settle()
    expect(rows(view)).toEqual(['第 0 个', '第 1 个', '第 2 个', '第 3 个', '第 4 个', '第 5 个'])
  })

  it('says there is none when the tenant has no sessions, or none hold the words', async () => {
    const { fake, shell } = await mounted()
    const { view } = pickIn(shell, '')
    const { view: worded } = pickIn(shell, '周报')
    ;(await fake.next('list-sessions')).answer(listPage([]))
    await settle()
    expect(view.container.textContent).toBe('还没有会话。')
    expect(worded.container.textContent).toBe('没有名字里有「周报」的会话。')
  })

  it('hands the picked session to pick as a reference of its kind, from the keyboard alone', async () => {
    const { fake, shell } = await mounted()
    const { picked } = pickIn(shell, '甲')
    ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
    await settle()
    const row = screen.getByRole('button', { name: '甲' })
    act(() => row.focus())
    expect(document.activeElement).toBe(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.click(row)
    expect(picked).toEqual([{ kind: KIND, ref: 'ses_a' }])
  })
})

it('without the canvas points the module loads as before and puts nothing on them', async () => {
  const { fake, shell } = await mounted({})
  expect(shell.items('pages').map(page => page.id)).toContain('conversation')
  const { container } = drawOn(shell, 'ses_a')
  expect(container.textContent).toBe('通用的一页')
  expect(pickIn(shell, '').view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})
