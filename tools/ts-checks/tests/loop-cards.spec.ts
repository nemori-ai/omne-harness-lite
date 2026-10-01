// 卡片台账：登记的收与拒、坏行、AT 的取法、stories.md 的解析，以及入口的退出码（拒绝是 1，参数错是 2）。
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeEntry, parseAt, readCards, type CardEntry } from '../src/loop/cards.ts'
import { parseStories } from '../src/loop/stories.ts'

const made: string[] = []
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
})

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

const entry = (card: string, event: CardEntry['event'], at: string): CardEntry => ({
  schema: 1,
  card,
  event,
  at,
  commit: 'c'.repeat(40),
  branch: 'main',
  recordedAt: '2026-10-01T00:00:00.000Z',
})

describe('登记的收与拒', () => {
  const proposed = entry('ST-016-01', 'proposed', '2026-09-28T02:00:00.000Z')

  it('依次登记三个事件：都收', () => {
    expect(judgeEntry([], { card: 'ST-016-01', event: 'proposed', at: proposed.at })).toEqual({
      ok: true,
    })
    expect(
      judgeEntry([proposed], {
        card: 'ST-016-01',
        event: 'runnable',
        at: '2026-09-29T02:00:00.000Z',
      }),
    ).toEqual({ ok: true })
    expect(
      judgeEntry([proposed, entry('ST-016-01', 'runnable', '2026-09-29T02:00:00.000Z')], {
        card: 'ST-016-01',
        event: 'accepted',
        at: '2026-09-30T02:00:00.000Z',
      }),
    ).toEqual({ ok: true })
  })

  it('同卡同事件已有一条：拒绝，说明已有那条的时间', () => {
    const judged = judgeEntry([proposed], {
      card: 'ST-016-01',
      event: 'proposed',
      at: '2026-09-30T00:00:00.000Z',
    })
    expect(judged.ok).toBe(false)
    if (!judged.ok)
      expect(judged.reason).toContain('已有一条 proposed，时间 2026-09-28T02:00:00.000Z')
  })

  it('时间早于 proposed：拒绝；与 proposed 同一时刻：收', () => {
    const judged = judgeEntry([proposed], {
      card: 'ST-016-01',
      event: 'accepted',
      at: '2026-09-28T01:59:59.000Z',
    })
    expect(judged.ok).toBe(false)
    if (!judged.ok) expect(judged.reason).toContain('早于这张卡的 proposed')
    expect(
      judgeEntry([proposed], { card: 'ST-016-01', event: 'runnable', at: proposed.at }),
    ).toEqual({ ok: true })
  })

  it('没有 proposed 先来 accepted 或 runnable：拒绝；别的卡的 proposed 不算', () => {
    for (const event of ['accepted', 'runnable'] as const) {
      const judged = judgeEntry([proposed], { card: 'ST-016-02', event, at: proposed.at })
      expect(judged.ok).toBe(false)
      if (!judged.ok) expect(judged.reason).toContain('还没有 proposed')
    }
  })
})

describe('读台账', () => {
  it('坏行跳过并报出行号；空行不算坏行；文件不存在当作空的', () => {
    const dir = temp('loop-cards-')
    const path = join(dir, 'cards.jsonl')
    expect(readCards(path)).toEqual({ entries: [], badLines: [] })
    const good = entry('ST-016-01', 'proposed', '2026-09-28T02:00:00.000Z')
    writeFileSync(
      path,
      [
        JSON.stringify(good),
        '{不是 JSON',
        '',
        JSON.stringify({ ...good, card: 'ST-16-1' }),
        JSON.stringify({ ...good, event: 'done' }),
        JSON.stringify({ ...good, at: '昨天' }),
        JSON.stringify({ ...good, event: 'accepted' }),
      ].join('\n'),
    )
    const read = readCards(path)
    expect(read.badLines).toEqual([2, 4, 5, 6])
    expect(read.entries.map(e => e.event)).toEqual(['proposed', 'accepted'])
  })
})

describe('AT 的取法', () => {
  it('带时区的按时区，不带的按本机时区，只给日期是本机零点', () => {
    expect(parseAt('2026-09-28T10:00+08:00')?.toISOString()).toBe('2026-09-28T02:00:00.000Z')
    expect(parseAt('2026-09-28T10:00:30Z')?.toISOString()).toBe('2026-09-28T10:00:30.000Z')
    expect(parseAt('2026-09-28T10:00')?.getTime()).toBe(new Date(2026, 8, 28, 10, 0).getTime())
    expect(parseAt('2026-09-28')?.getTime()).toBe(new Date(2026, 8, 28).getTime())
  })

  it('不合法的：不存在的日子、月份、钟点，不是 ISO 的写法', () => {
    for (const text of [
      '2026-02-30T10:00',
      '2026-13-01',
      '2026-09-28T25:00',
      '2026/09/28',
      '昨天',
      '1790560800',
    ])
      expect(parseAt(text), text).toBeUndefined()
  })
})

describe('stories.md', () => {
  it('只取卡号、标题与就绪；代码块里的、不合卡号写法的标题不算', () => {
    const text = [
      '# PF-016 故事卡',
      '',
      '### ST-016-01 · 用户能在终端里开一个会话',
      '',
      '- **价值**：…',
      '- **就绪**：是',
      '',
      '```markdown',
      '### ST-016-09 · 示例',
      '```',
      '',
      '### ST-016-02 · 第二张',
      '- **就绪**：否——缺 S3 的裁决',
      '',
      '### ST-16-3 · 写错的卡号',
      '- **就绪**：是',
      '',
      '### ST-016-03 · 没写就绪',
    ].join('\n')
    expect(parseStories(text)).toEqual([
      { id: 'ST-016-01', title: '用户能在终端里开一个会话', ready: 'ready' },
      { id: 'ST-016-02', title: '第二张', ready: 'not-ready' },
      { id: 'ST-016-03', title: '没写就绪', ready: 'unknown' },
    ])
  })
})

// 每条用例都起 git 与 node 子进程；全量检查满载时会超过默认的 5 秒，所以写明时限。
describe('入口', { timeout: 60_000 }, () => {
  const cli = fileURLToPath(new URL('../src/loop/cards-cli.ts', import.meta.url))

  function repository(): { root: string; home: string } {
    const root = temp('loop-cards-repo-')
    const home = temp('loop-cards-home-')
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
        { cwd: root, stdio: 'ignore' },
      )
    git('init', '-q')
    git('symbolic-ref', 'HEAD', 'refs/heads/main')
    const stories = join(root, '.meta_harness/design/product/PF-016-x/stories.md')
    mkdirSync(dirname(stories), { recursive: true })
    writeFileSync(stories, '### ST-016-01 · 一张卡\n- **就绪**：是\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'init')
    return { root, home }
  }

  const run = (root: string, home: string, ...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, '--root', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, OMNE_METRICS_HOME: home },
    })

  it('正常追加、重复被拒（退出 1）、时间倒挂被拒；卡不在 stories.md 里只提醒', () => {
    const { root, home } = repository()
    const first = run(
      root,
      home,
      '--card',
      'ST-016-01',
      '--event',
      'proposed',
      '--at',
      '2026-09-28T10:00+08:00',
    )
    expect(first.stderr).toBe('')
    expect(first.status).toBe(0)
    expect(first.stdout).toContain('已记 ST-016-01 proposed')
    expect(first.stdout).not.toContain('提醒')

    const again = run(root, home, '--card', 'ST-016-01', '--event', 'proposed')
    expect(again.status).toBe(1)
    expect(again.stdout).toContain('已有一条 proposed，时间 2026-09-28T02:00:00.000Z')

    const early = run(
      root,
      home,
      '--card',
      'ST-016-01',
      '--event',
      'accepted',
      '--at',
      '2026-09-27T00:00Z',
    )
    expect(early.status).toBe(1)
    expect(early.stdout).toContain('早于这张卡的 proposed')

    const elsewhere = run(root, home, '--card', 'ST-099-01', '--event', 'proposed')
    expect(elsewhere.status).toBe(0)
    expect(elsewhere.stdout).toContain('提醒：ST-099-01 不在这个检出的任何 stories.md 里')

    const lines = readFileSync(join(home, 'cards.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const recorded: unknown = JSON.parse(lines[0] ?? '')
    expect(recorded).toMatchObject({
      schema: 1,
      card: 'ST-016-01',
      event: 'proposed',
      at: '2026-09-28T02:00:00.000Z',
      branch: 'main',
    })
    expect((recorded as { commit: string }).commit).toMatch(/^[0-9a-f]{40}$/u)
  })

  it('参数错退出 2，不写台账：卡号格式错、事件不认得、AT 不合法、缺参数', () => {
    const { root, home } = repository()
    for (const args of [
      ['--card', 'ST-16-01', '--event', 'proposed'],
      ['--card', 'ST-016-01', '--event', 'done'],
      ['--card', 'ST-016-01', '--event', 'proposed', '--at', '2026-02-30'],
      ['--card', '', '--event', 'proposed'],
      ['--event', 'proposed'],
    ]) {
      const result = run(root, home, ...args)
      expect(result.status, args.join(' ')).toBe(2)
      expect(result.stderr).not.toBe('')
    }
    expect(readCards(join(home, 'cards.jsonl')).entries).toEqual([])
  })
})
