// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import type { AttachedItem, AttachedLayout } from '@omne-harness/shell-contract'
import { CardsHub, DecisionsPage } from '../src/index.ts'
import { releaseDetail } from '../src/cordis.ts'
import { DetailHost } from '../src/view/release-detail.tsx'
import { page, releaseItem } from './fixtures/cards.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const KIND = 'test.release@1'

beforeAll(stubAnimation)
afterEach(cleanup)

function testShell() {
  const items: AttachedItem[] = []
  return {
    contribute: (_slot: 'attached', item: AttachedItem) => void items.push(item),
    arranged: (anchor: string, subject: string, layout: AttachedLayout) =>
      layout(
        items
          .filter(item => item.anchor === anchor)
          .map(item => ({
            id: item.id,
            label: item.label,
            node: item.render({ scope: TENANT, subject }),
          })),
      ),
  }
}

type Drawing = 'draws' | 'none' | 'throws' | 'throws-at-once' | 'other-version'

function shellDrawing(drawing: Drawing) {
  const shell = testShell()
  const key = drawing === 'other-version' ? 'test.release@2' : KIND
  const Throwing = (): never => {
    throw new Error('the value does not parse')
  }
  if (drawing !== 'none')
    releaseDetail.contribute(shell, key, {
      id: 'test-view',
      order: 0,
      render: ({ subject }) => {
        if (drawing === 'throws-at-once') throw new Error('at once')
        if (drawing === 'throws') return <Throwing />
        return <p>{`工具的画法：${(JSON.parse(subject) as { title: string }).title}`}</p>
      },
    })
  return shell
}

const rows = [
  { label: '收件人', value: '你' },
  { label: '标签', value: ['a', 'b'] },
]
type Detail = NonNullable<
  Extract<HumanInterventionCardItem['card']['question'], { kind: 'release' }>['detail']
>
const DETAILS: Readonly<Record<string, Detail | undefined>> = {
  none: undefined,
  rows: { state: 'given', rows },
  typed: { state: 'given', rows, typed: { kind: KIND, value: '{"title":"T"}' } },
  unavailable: { state: 'unavailable' },
}

function withDetail(detail: Detail | undefined): HumanInterventionCardItem {
  const item = releaseItem()
  const question = item.card.question
  if (question.kind !== 'release') throw new Error('release fixture')
  const { detail: _dropped, ...rest } = question
  return {
    ...item,
    card: { ...item.card, question: detail === undefined ? rest : { ...rest, detail } },
  } as HumanInterventionCardItem
}

async function shown(detail: Detail | undefined, drawing: Drawing) {
  const fake = createFakeClient()
  render(
    <DetailHost.Provider value={shellDrawing(drawing)}>
      <DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />
    </DetailHost.Provider>,
  )
  const call = await fake.next('list-cards')
  call.answer(page([withDetail(detail)]))
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return within(screen.getByRole('article'))
}

const looksAt = (card: Awaited<ReturnType<typeof shown>>) => ({
  arguments: card.queryByText('参数') !== null,
  missing: card.queryByText('工具没能给出这次调用的详情') !== null,
  rows: card.queryByText('收件人') !== null,
  drawn: card.queryByText('工具的画法：T') !== null,
  broken: card.queryByText('这一块读不出') !== null,
})

describe('the detail part of a release card, by what the server holds and what the client can draw', () => {
  it.each([
    ['none', 'draws', { arguments: true, missing: false, rows: false, drawn: false }],
    ['none', 'none', { arguments: true, missing: false, rows: false, drawn: false }],
    ['rows', 'draws', { arguments: false, missing: false, rows: true, drawn: false }],
    ['rows', 'none', { arguments: false, missing: false, rows: true, drawn: false }],
    ['typed', 'draws', { arguments: false, missing: false, rows: false, drawn: true }],
    ['typed', 'none', { arguments: false, missing: false, rows: true, drawn: false }],
    ['unavailable', 'draws', { arguments: true, missing: true, rows: false, drawn: false }],
    ['unavailable', 'none', { arguments: true, missing: true, rows: false, drawn: false }],
  ] as const)('with the detail %s and a client that %s', async (held, drawing, expected) => {
    const card = await shown(DETAILS[held], drawing)
    expect(looksAt(card)).toEqual({ ...expected, broken: false })
  })

  it.each(['throws', 'throws-at-once', 'other-version'] as const)(
    'draws the rows when the view of the kind %s',
    async drawing => {
      const card = await shown(DETAILS.typed, drawing)
      expect(looksAt(card)).toEqual({
        arguments: false,
        missing: false,
        rows: true,
        drawn: false,
        broken: false,
      })
    },
  )

  it('lets the person switch from the view of the kind to the rows and back', async () => {
    const card = await shown(DETAILS.typed, 'draws')
    fireEvent.click(card.getByRole('button', { name: '看条目' }))
    expect(looksAt(card)).toMatchObject({ rows: true, drawn: false })
    fireEvent.click(card.getByRole('button', { name: '看工具的画法' }))
    expect(looksAt(card)).toMatchObject({ rows: false, drawn: true })
  })

  it('draws the rows of a typed detail where no shell hosts the views of kinds', async () => {
    const fake = createFakeClient()
    render(<DecisionsPage hub={new CardsHub({ client: fake.client })} tenant={TENANT} />)
    const call = await fake.next('list-cards')
    call.answer(page([withDetail(DETAILS.typed)]))
    await act(async () => {
      for (let round = 0; round < 5; round += 1) await Promise.resolve()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(looksAt(within(screen.getByRole('article')))).toMatchObject({
      rows: true,
      drawn: false,
    })
  })

  it('lists the items of a row that holds a list', async () => {
    const card = await shown(DETAILS.rows, 'none')
    expect(card.getAllByRole('listitem').map(item => item.textContent)).toEqual(['a', 'b'])
  })
})
