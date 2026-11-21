import { describe, expect, it } from 'vitest'
import { createReadiness } from '../src/main/readiness.ts'

describe('窗口就绪', () => {
  const track = () => {
    let ready = 0
    return { readiness: createReadiness(() => (ready += 1)), count: () => ready }
  }

  it('答 2xx 的文档加载完并且窗口显示了才算，先后不论，只报一次', () => {
    for (const order of [
      ['load', 'show'],
      ['show', 'load'],
    ]) {
      const { readiness, count } = track()
      for (const step of order)
        if (step === 'load') {
          readiness.navigated(200)
          readiness.finished()
        } else readiness.shown(true)
      readiness.shown(true)
      expect(count()).toBe(1)
    }
  })

  it('答错误状态的文档、加载失败后 Chromium 自己的错误页、隐藏的窗口都不算', () => {
    const http = track()
    http.readiness.shown(true)
    http.readiness.navigated(503)
    http.readiness.finished()
    expect(http.count()).toBe(0)

    const failed = track()
    failed.readiness.shown(true)
    failed.readiness.failed()
    failed.readiness.finished()
    expect(failed.count()).toBe(0)

    const hidden = track()
    hidden.readiness.navigated(200)
    hidden.readiness.finished()
    hidden.readiness.shown(false)
    expect(hidden.count()).toBe(0)
  })

  it('失败之后重新加载成功，照样算', () => {
    const { readiness, count } = track()
    readiness.shown(true)
    readiness.navigated(503)
    readiness.finished()
    readiness.navigated(200)
    readiness.finished()
    expect(count()).toBe(1)
  })
})
