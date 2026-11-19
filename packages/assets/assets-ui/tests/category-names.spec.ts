import { expect, it } from 'vitest'
import { createCategoryNames } from '../src/model/category-names.ts'
import { createFakeClient } from './fixtures/fake-client.ts'

const item = (category: string, title: string) => ({ category, title, summary: `${title}。` })

it('reads every page of list-categories into the name of each category', async () => {
  const fake = createFakeClient()
  const reading = createCategoryNames(fake.client).read()
  const first = await fake.next('list-categories')
  expect(first.body).toEqual({ after: null, limit: 100 })
  first.answer({
    outcome: 'succeeded',
    body: { items: [item('model-provider', '模型供应商')], next: 'model-provider' },
  })
  const second = await fake.next('list-categories')
  expect(second.body).toEqual({ after: 'model-provider', limit: 100 })
  second.answer({ outcome: 'succeeded', body: { items: [item('tool', '工具')], next: null } })
  expect(await reading).toEqual({
    kind: 'read',
    names: new Map([
      ['model-provider', '模型供应商'],
      ['tool', '工具'],
    ]),
  })
})

it('a refused page or a failed call is failed with its reason, never an empty list', async () => {
  const refused = createFakeClient()
  const refusedReading = createCategoryNames(refused.client).read()
  ;(await refused.next('list-categories')).answer({ outcome: 'basis-unavailable' })
  expect(await refusedReading).toEqual({
    kind: 'failed',
    notice: { kind: 'refused', text: '服务端暂时读不出需要的依据，稍后再试。' },
  })

  const failing = createCategoryNames({
    'list-categories': () => Promise.reject(new Error('the connection is gone')),
  } as never)
  expect(await failing.read()).toEqual({
    kind: 'failed',
    notice: { kind: 'unavailable', text: '没有发出去。' },
  })
})
