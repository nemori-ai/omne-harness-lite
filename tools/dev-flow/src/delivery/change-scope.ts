import { existsSync, readFileSync } from 'node:fs'
import { contextPath, readContextFile } from '../integration/context.ts'
import { git, repository, requireAncestor } from '../integration/git.ts'
import { IntegrationError, json } from '../integration/parse.ts'
import type { TaskBinding } from './binding.ts'
import {
  INTEGRATION_LINE,
  isOpenScope,
  LINES_PATH,
  parseDeliveryLines,
  scopeOwners,
  under,
  type DeliveryLines,
} from './lines.ts'

export const changeCodes = ['change-outside-scope', 'change-outside-line'] as const
export type ChangeCode = (typeof changeCodes)[number]
/** One changed file that the card may not change, with the way to remove the finding. */
export type ChangeFinding = { code: ChangeCode; file: string; message: string; remedy: string }
export type ChangeScopeReport =
  | { bound: false; message: string }
  | {
      bound: true
      issue: string
      attempt: string
      taskBase: string
      head: string
      /** The changed files of this card, sorted; task tmp and shared paths included. */
      files: string[]
      findings: ChangeFinding[]
    }

const REMEDIES: Record<ChangeCode, string> = {
  'change-outside-scope':
    '撤回这个文件的改动。确实要改时，请调度者扩大写范围并重新派发，再提交这个改动。',
  'change-outside-line':
    '撤回这个文件的改动。别的线与联调轨道的路径由那条线的卡或交付线为 integration 的卡修改。',
}

function nameList(output: string): string[] {
  return output.split('\0').filter(file => file !== '')
}
/**
 * The files this card changed since `taskBase`, one commit at a time along the first-parent
 * chain of HEAD:
 *
 * - A commit with one parent gives every file it changes. Renames count as a deletion and an
 *   addition.
 * - A merge gives only the files that differ from every parent (`diff-tree --cc`): conflict
 *   resolutions and changes made in the merge. The commits it brings in are not walked.
 * - The worktree adds tracked files that differ from HEAD and untracked files Git does not
 *   ignore.
 */
export function cardChanges(root: string, taskBase: string): string[] {
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  requireAncestor(root, taskBase, head)
  const files = new Set<string>(),
    add = (output: string) => nameList(output).forEach(file => files.add(file))
  const commits = git(root, ['rev-list', '--first-parent', '--parents', `${taskBase}..${head}`])
    .split('\n')
    .filter(line => line !== '')
    .map(line => line.split(' '))
  for (const [commit, ...parents] of commits) {
    if (commit === undefined) continue
    if (parents.length > 1)
      add(git(root, ['diff-tree', '--cc', '--no-commit-id', '--name-only', '-z', commit]))
    else
      add(
        git(root, [
          'diff-tree',
          '-r',
          '--no-renames',
          '--no-commit-id',
          '--name-only',
          '-z',
          `${commit}^`,
          commit,
        ]),
      )
  }
  add(git(root, ['diff', '--no-renames', '--name-only', '-z', 'HEAD']))
  add(git(root, ['ls-files', '--others', '--exclude-standard', '-z']))
  return [...files].sort()
}

/**
 * The findings for the changed files of a card. Task tmp and shared paths do not count. Every
 * other file must be under a write scope entry. A version 2 card of a line also changes only
 * files of its own line. Integration cards and version 1 bindings get no line check: a
 * version 1 binding has no line field.
 */
export function changeFindings(
  files: readonly string[],
  binding: TaskBinding,
  lines: DeliveryLines,
): ChangeFinding[] {
  const line =
    binding.schemaVersion === 2 && binding.line !== INTEGRATION_LINE ? binding.line : undefined
  const finding = (code: ChangeCode, file: string, message: string): ChangeFinding => ({
    code,
    file,
    message,
    remedy: REMEDIES[code],
  })
  return files.flatMap(file => {
    if (isOpenScope(lines, file)) return []
    const findings: ChangeFinding[] = []
    if (!binding.writeScope.some(entry => under(file, entry)))
      findings.push(finding('change-outside-scope', file, `${file} 不在 binding 的写范围内。`))
    if (line !== undefined) {
      const others = [...scopeOwners(lines, file)].filter(owner => owner !== line)
      if (others.length > 0)
        findings.push(
          finding(
            'change-outside-line',
            file,
            `${file} 属于 ${others.join('、')}，不在本线 ${line} 内。`,
          ),
        )
    }
    return findings
  })
}

/** The line table of `commit`, the table the card was dispatched against. */
function committedLines(root: string, commit: string): DeliveryLines {
  return parseDeliveryLines(
    json(git(root, ['show', `${commit}:${LINES_PATH}`]), `${commit}:${LINES_PATH}`),
  )
}
/**
 * Checks the changes of the card bound to this tree. Without a task context the tree is
 * unbound and nothing is checked. `linesFile` replaces the line table of taskBase.
 */
export function changeScope({
  root,
  linesFile,
}: {
  root: string
  linesFile?: string
}): ChangeScopeReport {
  const actual = repository(root).root
  if (!existsSync(contextPath(actual)))
    return { bound: false, message: '未绑定：本工作树没有 task context，不核对写范围与线归属。' }
  const binding = readContextFile(actual).context.ownerTask
  if (binding === null)
    throw new IntegrationError('input-error', 'The task context has no owner task to check')
  const lines =
      linesFile === undefined
        ? committedLines(actual, binding.taskBase)
        : parseDeliveryLines(json(readFileSync(linesFile, 'utf8'), linesFile)),
    files = cardChanges(actual, binding.taskBase)
  return {
    bound: true,
    issue: binding.issue.url,
    attempt: binding.attempt,
    taskBase: binding.taskBase,
    head: git(actual, ['rev-parse', 'HEAD']),
    files,
    findings: changeFindings(files, binding, lines),
  }
}
