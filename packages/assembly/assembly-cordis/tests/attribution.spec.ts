// @module-tag slow
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { attributed, attributedNow } from '@omne-harness/assembly-cordis'

const fixture = fileURLToPath(new URL('./fixtures/fall.mjs', import.meta.url))
const fall = (way: string): Promise<{ code: number | null; told: unknown[] }> =>
  new Promise(resolve => {
    execFile(process.execPath, [fixture, way], { timeout: 20_000 }, (error, stdout) => {
      const told = stdout
        .split('\n')
        .filter(line => line !== '')
        .map(line => JSON.parse(line) as unknown)
      resolve({
        code: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        told,
      })
    })
  })

describe('归因：这一刻正在执行的是哪一份客人的调用', () => {
  it('在一次归了因的调用里面读得到它是谁，外面读不到；嵌套时是最里面的那一份', async () => {
    expect(attributedNow()).toBeUndefined()
    expect(attributed('plugin:a', () => attributedNow())).toBe('plugin:a')
    expect(attributed('plugin:a', () => attributed('plugin:b', () => attributedNow()))).toBe(
      'plugin:b',
    )
    const later = attributed('plugin:a', async () => {
      await new Promise(done => setTimeout(done, 1))
      return attributedNow()
    })
    expect(await later).toBe('plugin:a')
    expect(attributedNow()).toBeUndefined()
  })
})

describe('进程级的未接住异常：记下原因与归因，以 1 退出', () => {
  it.each([
    ['调用里排的微任务抛出', 'sync-later', 'plugin:a', 'guest broke'],
    ['调用里起的定时器抛出', 'timer', 'plugin:a', 'guest broke'],
    ['调用里没人接的拒绝', 'rejection', 'plugin:a', 'guest rejected'],
    ['调用 await 之后抛出', 'after-await', 'plugin:a', 'guest broke'],
    ['嵌套的调用：归到最里面的那一份', 'nested', 'plugin:b', 'guest broke'],
  ])('%s：归到那一份', async (_, way, who, error) => {
    expect(await fall(way)).toEqual({ code: 1, told: [{ who, error }] })
  })

  it.each([
    ['调用之外抛出', 'outside', 'guest broke'],
    ['调用之外没人接的拒绝', 'outside-rejection', 'host rejected'],
  ])('%s：不知道是谁，不冤枉任何一份', async (_, way, error) => {
    expect(await fall(way)).toEqual({ code: 1, told: [{ who: null, error }] })
  })
})
