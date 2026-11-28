// @vitest-environment happy-dom
import type { InspectionNow, SeenResult } from '@omne-harness/interface-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { answerNow } from '../src/answer.ts'
import { measure, waitFor } from '../src/measure.ts'

const page = `
  <main data-omne-part="weather.page">
    <h1 data-omne-part="weather.title">天气</h1>
    <input aria-label="城市" value="上海" />
    <section data-omne-part="weather.card"><p>晴，  二十度</p></section>
  </main>
  <div role="dialog" aria-label="禁用"><p>禁用整份？</p><button>禁用整份</button></div>
  <div role="status"></div>
  <section hidden><div role="status">这段时间没有数据</div></section>
`

afterEach(() => {
  document.body.innerHTML = ''
})

describe('what is drawn now, read without changing anything', () => {
  it('lists each part with its text and its parent, and each dialog open on top; an empty or hidden one is not', () => {
    document.body.innerHTML = page
    const read = measure(document, { page: 'weather' })
    expect(read.page).toBe('weather')
    expect(read.parts.map(({ part, text, within }) => [part, text, within])).toEqual([
      ['weather.page', '天气 晴， 二十度', null],
      ['weather.title', '天气', 0],
      ['weather.card', '晴， 二十度', 0],
    ])
    expect(read.layers).toEqual([{ role: 'dialog', label: '禁用', text: '禁用整份？禁用整份' }])
    expect(read.more).toBe(0)
  })

  it('reads only the named part and what is in it; a part not drawn gives none', () => {
    document.body.innerHTML = page
    expect(measure(document, { part: 'weather.card' }).parts.map(each => each.part)).toEqual([
      'weather.card',
    ])
    expect(measure(document, { part: 'weather.map' }).parts).toEqual([])
  })

  it('lists at most 300 parts and counts the rest', () => {
    document.body.innerHTML = Array.from(
      { length: 310 },
      (_, at) => `<i data-omne-part="p.${at}"></i>`,
    ).join('')
    const read = measure(document)
    expect(read.parts).toHaveLength(300)
    expect(read.more).toBe(10)
  })

  it('leaves the page, the focus and the field as they were (I-9)', () => {
    document.body.innerHTML = page
    const field = document.querySelector('input')!
    field.focus()
    field.value = '上海浦东'
    const before = document.body.innerHTML
    measure(document)
    measure(document, { part: 'weather.card' })
    expect(document.body.innerHTML).toBe(before)
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('上海浦东')
  })
})

describe('waiting for a part before answering', () => {
  it('answers at once when it is there, when it comes with its text, and false when its time runs out', async () => {
    document.body.innerHTML = page
    const stop = new AbortController()
    expect(await waitFor(document, { part: 'weather.card', seconds: 1 }, stop.signal)).toBe(true)
    const later = waitFor(
      document,
      { part: 'weather.alert', text: '大风', seconds: 2 },
      stop.signal,
    )
    const alert = document.createElement('div')
    alert.setAttribute('data-omne-part', 'weather.alert')
    document.body.append(alert)
    await new Promise(resolve => setTimeout(resolve, 20))
    alert.textContent = '大风预警'
    expect(await later).toBe(true)
    expect(await waitFor(document, { part: 'weather.map', seconds: 1 }, stop.signal)).toBe(false)
  })
})

describe('a question of now, answered with what the person sees', () => {
  const ask = async (frame: InspectionNow, capture?: () => Promise<undefined>) => {
    const delivered: [string, SeenResult, boolean][] = []
    const frames = [frame]
    await answerNow(
      {
        next: async () =>
          frames.length === 0
            ? { done: true, value: undefined }
            : { done: false, value: frames.shift()! },
      },
      { root: () => document, page: () => 'weather', ...(capture !== undefined && { capture }) },
      async (request, result, met) => void delivered.push([request, result, met]),
      new AbortController().signal,
    )
    return delivered
  }

  it('delivers the structure, and that what was waited for did not come', async () => {
    document.body.innerHTML = page
    const [told] = await ask({
      request: 'n-1',
      want: 'structure',
      until: { part: 'weather.map', seconds: 1 },
    })
    expect(told?.[0]).toBe('n-1')
    expect(told?.[1]).toMatchObject({ kind: 'structure', structure: { page: 'weather' } })
    expect(told?.[2]).toBe(false)
  })

  it('a picture without a way to take one is unsupported; one the host could not take is not settled', async () => {
    document.body.innerHTML = page
    expect((await ask({ request: 'n-2', want: 'image' }))[0]?.[1]).toEqual({
      kind: 'cannot',
      reason: 'unsupported',
    })
    expect((await ask({ request: 'n-3', want: 'image' }, async () => undefined))[0]?.[1]).toEqual({
      kind: 'cannot',
      reason: 'not-settled',
    })
  })
})
