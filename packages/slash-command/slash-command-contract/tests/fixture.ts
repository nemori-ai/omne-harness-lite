import type { CommandEntry, Recognition } from '@omne-harness/slash-command-contract'

const reference = (name: string, title: string, unavailable?: string): CommandEntry => ({
  space: 'skill',
  name,
  kind: 'reference',
  title,
  ...(unavailable === undefined ? {} : { unavailable }),
})
const prompt = (name: string, title: string, hint: string): CommandEntry => ({
  space: 'prompt',
  name,
  kind: 'prompt',
  title,
  hint,
})
const system = (
  name: string,
  title: string,
  hint?: string,
  unavailable?: string,
): CommandEntry => ({
  space: 'omne-official',
  name,
  kind: 'system',
  title,
  ...(hint === undefined ? {} : { hint }),
  ...(unavailable === undefined ? {} : { unavailable }),
})

/** The demo list the rules are pushed through. A name the person may not see is simply not in it. */
export const entries: readonly CommandEntry[] = [
  reference('review', '按团队的标准评审一份改动'),
  reference('deploy-check', '上线前的检查单'),
  reference('code-review', '只看代码风格的评审'),
  reference('tmp', '整理临时文件（名字故意和目录撞）'),
  reference('status', '写一份项目状态周报（名字和系统命令撞）'),
  reference('old-style', '旧的写作风格', '这个 Skill 被管理员停用了'),
  prompt('commit', '照约定写一条提交说明', '<做了什么>'),
  prompt('explain', '把一段代码讲给新人听', '<文件或片段>'),
  system('reload', '重新加载这段会话用的能力', '[skills|tools|all]'),
  system('compact', '压缩这段会话的历史', '[保留什么]', '一轮在跑，等它结束'),
  system('model', '换这段会话用的模型', '<模型名>'),
  system('status', '看会话在做什么、用了多少'),
]

/** T plain text, C:<name> a command at the head, R:<a,b> references, X:<reason> refused. */
export function outcome(recognition: Recognition): string {
  if (recognition.kind === 'refused') return `X:${recognition.reason}`
  if (recognition.kind === 'command') return `C:${recognition.name}`
  const names = [...new Set(recognition.references.map(reference => reference.name))]
  return names.length > 0 ? `R:${names.join(',')}` : 'T'
}
