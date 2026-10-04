// 删卡记录的正反夹具，在临时仓库里造提交：删卡带 Accepted-Card／Voided-Card 通过；不带、点错卡号、
// 点了没删、「已发到」变小、stories.md 被删，各自报出。合并提交只为「每边都还在、合并后不见了」的卡负责。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectRetire, judgeRetire, type Queues } from '../src/product/retire.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const PRODUCT = '.meta_harness/design/product'
const STORIES = `${PRODUCT}/PF-016-cli/stories.md`
const card = (id: string) => `### ${id} · 一张卡\n\n- **就绪**：是\n`
const queue = (water: string, ...ids: string[]) =>
  `# PF-016 故事卡\n\n**已发到**：${water}\n\n${ids.map(card).join('\n')}`

/** 一个已经切了两张卡的仓库；返回它和基线。 */
function cut(): { root: string; base: string } {
  const root = repository()
  write(root, STORIES, queue('ST-016-02', 'ST-016-01', 'ST-016-02'))
  return { root, base: commit(root, 'cut two cards') }
}

const inspect = (root: string, base: string) => inspectRetire(root, base, PRODUCT)

// 每条用例都起几次 git 子进程；全量检查满载时单条会超过默认的 5 秒。
describe('删卡记录：读仓库', { timeout: 60_000 }, () => {
  it('删卡带 Accepted-Card：通过，并列出这次接受；只加新卡、改「已发到」往大走的提交不用 trailer', () => {
    const { root, base } = cut()
    write(root, STORIES, queue('ST-016-02', 'ST-016-02'))
    const accepted = commit(root, 'product: accept ST-016-01\n\nAccepted-Card: ST-016-01')
    write(root, STORIES, queue('ST-016-03', 'ST-016-02', 'ST-016-03'))
    commit(root, 'product: cut ST-016-03')
    const report = inspect(root, base)
    expect(report.violations).toEqual([])
    expect(report.commits.map(entry => [entry.sha, entry.retired])).toContainEqual([
      accepted,
      [{ card: 'ST-016-01', key: 'Accepted-Card' }],
    ])
  })

  it('删卡带 Voided-Card：同样通过', () => {
    const { root, base } = cut()
    write(root, STORIES, queue('ST-016-02', 'ST-016-01'))
    commit(root, 'product: void ST-016-02\n\nVoided-Card: ST-016-02')
    expect(inspect(root, base).violations).toEqual([])
  })

  it('删卡不带 trailer：报出卡号与提交', () => {
    const { root, base } = cut()
    write(root, STORIES, queue('ST-016-02', 'ST-016-02'))
    const sha = commit(root, 'product: drop a card')
    expect(inspect(root, base).violations).toEqual([
      `提交 ${sha.slice(0, 9)}（product: drop a card）：ST-016-01 从 stories.md 里删掉了，提交里没有 Accepted-Card 或 Voided-Card 点到它`,
    ])
  })

  it('点错卡号：删的那张缺记录，点到的那张还在', () => {
    const { root, base } = cut()
    write(root, STORIES, queue('ST-016-02', 'ST-016-02'))
    const sha = commit(root, 'product: accept\n\nAccepted-Card: ST-016-02')
    const where = `提交 ${sha.slice(0, 9)}（product: accept）`
    expect(inspect(root, base).violations).toEqual([
      `${where}：ST-016-01 从 stories.md 里删掉了，提交里没有 Accepted-Card 或 Voided-Card 点到它`,
      `${where}：Accepted-Card: ST-016-02，可这张卡在这个提交之后还在 stories.md 里`,
    ])
  })

  it('点了没删：哪怕这个提交没碰 stories.md 也报', () => {
    const { root, base } = cut()
    write(root, 'README.md', 'changed\n')
    const sha = commit(root, 'docs: note\n\nAccepted-Card: ST-016-01')
    expect(inspect(root, base).violations).toEqual([
      `提交 ${sha.slice(0, 9)}（docs: note）：Accepted-Card: ST-016-01，可这张卡在这个提交之后还在 stories.md 里`,
    ])
  })

  it('「已发到」变小：报出从多少改成多少', () => {
    const { root, base } = cut()
    write(root, STORIES, queue('ST-016-01', 'ST-016-01'))
    const sha = commit(root, 'product: void ST-016-02\n\nVoided-Card: ST-016-02')
    expect(inspect(root, base).violations).toEqual([
      `提交 ${sha.slice(0, 9)}（product: void ST-016-02）：${STORIES} 的「已发到」从 ST-016-02 改小成了 ST-016-01：它只增不减`,
    ])
  })

  it('stories.md 整份删掉：卡与「已发到」都算', () => {
    const { root, base } = cut()
    git(root, 'rm', '-q', STORIES)
    const sha = commit(root, 'product: drop the queue\n\nAccepted-Card: ST-016-01')
    const where = `提交 ${sha.slice(0, 9)}（product: drop the queue）`
    expect(inspect(root, base).violations).toEqual([
      `${where}：ST-016-02 从 stories.md 里删掉了，提交里没有 Accepted-Card 或 Voided-Card 点到它`,
      `${where}：${STORIES} 被删掉了，「已发到」ST-016-02 随之丢失：切过卡的 topic 要一直留着这份文件`,
    ])
  })

  it('合并：一边带 trailer 删了卡，合并提交不必再点；两边都在、合并时删掉的要点', () => {
    const { root, base } = cut()
    git(root, 'checkout', '-q', '-b', 'side')
    write(root, STORIES, queue('ST-016-02', 'ST-016-02'))
    commit(root, 'product: accept\n\nAccepted-Card: ST-016-01')
    git(root, 'checkout', '-q', 'main')
    write(root, 'README.md', 'main moved\n')
    commit(root, 'docs: main moved')
    git(root, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side')
    expect(inspect(root, base).violations).toEqual([])

    git(root, 'checkout', '-q', '-b', 'other', base)
    write(root, 'NOTE.md', 'x\n')
    commit(root, 'docs: other')
    git(root, 'checkout', '-q', 'main')
    git(root, 'merge', '-q', '--no-ff', '--no-commit', 'other')
    write(root, STORIES, queue('ST-016-02'))
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'merge other, dropping a card on the way')
    const merge = git(root, 'rev-parse', 'HEAD')
    expect(inspect(root, base).violations).toEqual([
      `提交 ${merge.slice(0, 9)}（merge other, dropping a card on the way）：ST-016-02 从 stories.md 里删掉了，提交里没有 Accepted-Card 或 Voided-Card 点到它`,
    ])
  })
})

describe('删卡记录：判断', () => {
  const queues = (cards: string[], water = 'ST-016-03'): Queues =>
    new Map([['016', { path: STORIES, cards, highWater: [water] }]])

  it('点到的卡父提交里就没有；同一张卡点两次；值不是卡号', () => {
    const judged = judgeRetire({
      sha: 'a'.repeat(40),
      subject: 's',
      trailers: [
        { key: 'Accepted-Card', value: 'ST-016-09' },
        { key: 'Accepted-Card', value: 'ST-016-01' },
        { key: 'Voided-Card', value: 'ST-016-01' },
        { key: 'Voided-Card', value: 'ST-016-01, ST-016-02' },
      ],
      parents: [queues(['ST-016-01'])],
      result: queues([]),
    })
    expect(judged.violations.map(v => v.replace(/^提交 a{9}（s）：/u, ''))).toEqual([
      'ST-016-01 被点了不止一次（Accepted-Card 与 Voided-Card）',
      'Voided-Card 的值「ST-016-01, ST-016-02」不是卡号',
      'Accepted-Card: ST-016-09，可父提交的 stories.md 里就没有这张卡',
    ])
    expect(judged.retired).toEqual([{ card: 'ST-016-01', key: 'Accepted-Card' }])
  })

  it('父提交的「已发到」读不出（还没有这一行）：不比，不报', () => {
    const judged = judgeRetire({
      sha: 'b'.repeat(40),
      subject: 's',
      trailers: [],
      parents: [new Map([['016', { path: STORIES, cards: ['ST-016-01'], highWater: [] }]])],
      result: queues(['ST-016-01'], 'ST-016-01'),
    })
    expect(judged.violations).toEqual([])
  })
})

describe('删卡记录入口', { timeout: 60_000 }, () => {
  const cli = fileURLToPath(new URL('../src/product/retire-cli.ts', import.meta.url))
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], { encoding: 'utf8' })

  it('有缺退出 1、没缺退出 0、少了 --base 退出 2；输出写明它管不到 squash 合并的说明', () => {
    const { root, base } = cut()
    const clean = run('--root', root, '--base', base)
    expect(clean.status).toBe(0)
    expect(clean.stdout).toContain('管不到：以 squash 合入主线时')
    write(root, STORIES, queue('ST-016-02', 'ST-016-02'))
    commit(root, 'product: drop a card')
    const broken = run('--root', root, '--base', base)
    expect(broken.status).toBe(1)
    expect(broken.stdout).toContain('缺记录或对不上 1 处：')
    expect(run('--root', root).status).toBe(2)
  })
})
