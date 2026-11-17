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
  expect(await reading).toEqual(
    new Map([
      ['model-provider', '模型供应商'],
      ['tool', '工具'],
    ]),
  )
})

it('has no names when a page is refused or the call fails', async () => {
  const refused = createFakeClient()
  const refusedReading = createCategoryNames(refused.client).read()
  ;(await refused.next('list-categories')).answer({ outcome: 'basis-unavailable' })
  expect(await refusedReading).toBeUndefined()

  const failing = createCategoryNames({
    'list-categories': () => Promise.reject(new Error('the connection is gone')),
  } as never)
  expect(await failing.read()).toBeUndefined()
})
