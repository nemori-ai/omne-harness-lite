import type { Toast } from '@omne-harness/shell-contract'
import { describe, expect, it } from 'vitest'
import { tellPageVersion } from '../src/page/shell/page-version.ts'
import { pageNoticeText, type PageNotice } from '../src/shared/page-version.ts'

function page(notice: PageNotice | null, options: { signedIn?: boolean; roomAfter?: number } = {}) {
  const calls: string[] = []
  const gate: string[] = []
  let said: { toast: Toast } | undefined
  let shows = 0
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    return new Response(JSON.stringify({ version: 'builtin', notice }), {
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const result = tellPageVersion({
    signedIn: () => options.signedIn ?? true,
    gate: text => void gate.push(text),
    told: {
      show(_owner, toast) {
        shows += 1
        if (shows > (options.roomAfter ?? 0)) said = { toast }
      },
      said: () => said,
    },
    fetcher,
    wait: async () => undefined,
  })
  return { result, calls, gate, said: () => said }
}

describe('页面把版本的事告诉人', () => {
  const fell: PageNotice = { kind: 'fell', from: 'page-2', to: 'builtin', falls: 3 }

  it('登录着：写成一张告知笺，人看得到了才答主进程「说过了」', async () => {
    const run = page(fell)
    expect(await run.result).toBe('told')
    expect(run.said()?.toast).toEqual({
      id: 'page-version',
      tone: 'attention',
      title: '页面已退回自带版本',
      body: '新版起不来',
    })
    expect(run.calls).toEqual(['GET /device/page-version', 'POST /device/page-version/told'])
  })

  it('这时没有地方写告知笺：等有了再写，写上之前不答「说过了」；一直没有就不答', async () => {
    const later = page(fell, { roomAfter: 3 })
    expect(await later.result).toBe('told')
    expect(later.calls.at(-1)).toBe('POST /device/page-version/told')
    const never = page(fell, { roomAfter: 1000 })
    expect(await never.result).toBe('no-room')
    expect(never.calls).toEqual(['GET /device/page-version'])
  })

  it('没登录：写在登录入口的那一行', async () => {
    const run = page({ kind: 'switched', to: 'page-4a5b6c7d8e9f' }, { signedIn: false })
    expect(await run.result).toBe('told')
    expect(run.gate).toEqual(['页面已换到版本 4a5b6c'])
  })

  it('没有要说的，或答的不是这个地址该答的：什么都不写', async () => {
    const run = page(null)
    expect(await run.result).toBe('nothing')
    expect(run.calls).toEqual(['GET /device/page-version'])
    const html = (async () =>
      new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch
    const browser = tellPageVersion({
      signedIn: () => true,
      gate() {},
      told: { show() {}, said: () => undefined },
      fetcher: html,
    })
    expect(await browser).toBe('nothing')
  })

  it('每一种要说的事各有一句，短到告知笺的两行写得下：出了什么事，现在用的是哪一版', () => {
    const texts = (
      [
        { kind: 'switched', to: 'page-4a5b6c7d8e9f' },
        { kind: 'fell', from: 'page-4a5b6c7d8e9f', to: 'page-0a1b2c3d4e5f', falls: 3 },
        { kind: 'fell', from: 'page-4a5b6c7d8e9f', to: 'builtin', falls: 3 },
        { kind: 'unusable', from: 'page-4a5b6c7d8e9f', reason: 'digest-mismatch' },
        { kind: 'refused', reason: 'not-mounted', version: 'page-4a5b6c7d8e9f' },
        { kind: 'refused', reason: 'signature-invalid' },
      ] as const
    ).map(notice => {
      const { title, body } = pageNoticeText(notice)
      return body === undefined ? title : `${title}：${body}`
    })
    expect(texts).toEqual([
      '页面已换到版本 4a5b6c',
      '页面已退回版本 0a1b2c：新版起不来',
      '页面已退回自带版本：新版起不来',
      '页面这次用自带版本：文件被改过',
      '新版页面没换上：试起时没显示',
      '新版页面没换上：签名不对',
    ])
    // Two lines of the note at home are about seventeen full-width characters; a Latin one takes half of one.
    const wide = (text: string): number =>
      [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.5 : 1), 0)
    for (const text of texts) expect(wide(text), text).toBeLessThanOrEqual(17)
  })
})
