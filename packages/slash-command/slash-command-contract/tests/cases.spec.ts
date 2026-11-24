import { lookupOf, recognize } from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'
import { entries, outcome } from './fixture.ts'

const lookup = lookupOf({ entries, missing: [] })

const cases: readonly (readonly [string, string, string])[] = [
  ['开头的命令', '/omne-official:reload', 'C:omne-official:reload'],
  ['开头的命令', '/omne-official:reload skills', 'C:omne-official:reload'],
  ['开头的命令', '   /omne-official:model fable', 'C:omne-official:model'],
  ['开头的命令', '/reload', 'C:omne-official:reload'],
  ['开头的命令', '/model fable', 'C:omne-official:model'],
  ['开头的命令', '/commit 修复登录超时', 'C:prompt:commit'],
  ['开头的命令', '/commit 参考 /review 的写法', 'C:prompt:commit'],
  ['开头的命令', '/COMMIT 大写也认', 'C:prompt:commit'],
  ['开头是 Skill', '/review 看一下这个 PR', 'R:skill:review'],
  ['开头是 Skill', '/review看一下', 'R:skill:review'],
  ['开头是 Skill', '/review 再跑一遍 /deploy-check', 'R:skill:review,skill:deploy-check'],
  ['开头被拒', '/nope 做点什么', 'X:no-such-command'],
  ['开头被拒', '/secret-skill 用一下', 'X:no-such-command'],
  ['开头被拒', '/usr', 'X:no-such-command'],
  ['开头被拒', '/omne-official:compact', 'X:unavailable'],
  ['开头被拒', '/old-style 写一段', 'X:unavailable'],
  ['开头是普通文字', '/usr/bin/env 是什么', 'T'],
  ['开头是普通文字', '\\/usr 是什么目录', 'T'],
  ['开头是普通文字', '/ 这个斜杠怎么读', 'T'],
  ['开头是普通文字', '/*注释*/ 这样写对吗', 'T'],
  ['开头是普通文字', '//TODO 是什么意思', 'T'],
  ['开头是普通文字', '/review.md 这个文件在哪', 'T'],
  ['开头是普通文字', '`/review` 这个命令怎么用', 'T'],
  ['句中的引用', '帮我用 /review 看一下这个 PR', 'R:skill:review'],
  ['句中的引用', '帮我用/review看一下', 'R:skill:review'],
  ['句中的引用', '先 /review 再 /deploy-check，最后总结', 'R:skill:review,skill:deploy-check'],
  ['句中的引用', '用 /review 和 /review 对比两次', 'R:skill:review'],
  ['句中的引用', '用 /REVIEW 看', 'R:skill:review'],
  ['句中的引用', '用 /skill:review 看', 'R:skill:review'],
  ['句中的引用', '用 /code-review 看', 'R:skill:code-review'],
  ['句中的引用', '说明：/review', 'R:skill:review'],
  ['句中的引用', '（/review）', 'R:skill:review'],
  ['句中的引用', '(/review)', 'R:skill:review'],
  ['句中的引用', '用 /review。', 'R:skill:review'],
  ['句中的引用', '用 /review.', 'R:skill:review'],
  ['句中的引用', '用 /review, 然后提交', 'R:skill:review'],
  ['句中的引用', '第一行\n/review 第二行开头', 'R:skill:review'],
  ['句中不是引用', '看看 /etc/hosts', 'T'],
  ['句中不是引用', '路径是 /usr/local', 'T'],
  ['句中不是引用', '目录 /etc 下面有什么', 'T'],
  ['句中不是引用', 'and/or', 'T'],
  ['句中不是引用', 'TCP/IP 和 km/h', 'T'],
  ['句中不是引用', '日期 2026/11/24，比例 1/2', 'T'],
  ['句中不是引用', '打开 http://a.b/review', 'T'],
  ['句中不是引用', '打开 https://x.y/review/1', 'T'],
  ['句中不是引用', '标签 </div> 和 <br/>', 'T'],
  ['句中不是引用', '相对路径 ./review ../review ~/review', 'T'],
  ['句中不是引用', '盘符 C:/review', 'T'],
  ['句中不是引用', '注意:/review', 'T'],
  ['句中不是引用', '文件 /review.md 和 /review/a', 'T'],
  ['句中不是引用', '行内代码 `/review` 不算', 'T'],
  ['句中不是引用', '```\n/review\n```\n代码块里的不算', 'T'],
  ['句中不是引用', '不要引用 \\/review', 'T'],
  ['句中不是引用', '用 /nope 试试', 'T'],
  ['句中不是引用', '用 /secret-skill 试试', 'T'],
  ['句中不是引用', '用 /old-style 写', 'T'],
  ['句中不是引用', '用 /omne-official:reload 重新加载', 'T'],
  ['句中不是引用', '用 /reload 重新加载', 'T'],
  ['句中不是引用', '邮箱 a@b/review，占比 50%/review', 'T'],
  ['撞名', '清一下 /tmp 目录', 'R:skill:tmp'],
  ['撞名', '清一下 \\/tmp 目录', 'T'],
  ['撞名', '清一下 /tmp/cache 目录', 'T'],
  ['撞名', '/status 看一下', 'C:omne-official:status'],
  ['撞名', '看一下 /status', 'R:skill:status'],
  ['撞名', '/skill:status 写一份', 'R:skill:status'],
  ['撞名', '看一下 /omne-official:status', 'T'],
]

describe('the recognition rules on the case table', () => {
  it('has the 66 cases of the prototype', () => expect(cases).toHaveLength(66))
  it.each(cases)('%s：%j', (_group, text, expected) => {
    expect(outcome(recognize(text, lookup))).toBe(expected)
  })
})

describe('what a message carries', () => {
  it('drops the escaping backslash from the text it hands on, and keeps code as written', () => {
    const said = recognize('不要引用 \\/review，`a\\/b` 照写', lookup)
    expect(said.kind === 'message' && said.text).toBe('不要引用 /review，`a\\/b` 照写')
  })

  it('notes a name it knows that does not count where it stands', () => {
    const said = recognize('用 /reload 再 /old-style', lookup)
    expect(said.kind === 'message' && said.notes).toEqual([
      { kind: 'head-only', name: 'omne-official:reload', span: [2, 9] },
      {
        kind: 'unavailable',
        name: 'skill:old-style',
        span: [12, 22],
        reason: '这个 Skill 被管理员停用了',
      },
    ])
  })

  it('takes everything after a command as its argument, references included', () => {
    expect(recognize('/commit 参考 /review 的写法', lookup)).toEqual({
      kind: 'command',
      name: 'prompt:commit',
      command: 'prompt',
      span: [0, 7],
      args: '参考 /review 的写法',
    })
  })
})
