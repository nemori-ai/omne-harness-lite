import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contextPath, readContextFile, type Context } from '../integration/context.ts'
import {
  contractApiCommand,
  parseDiffRun,
  runDiff,
  type DiffRun,
} from '../integration/contract-diff.ts'
import { git, repository, requireAncestor } from '../integration/git.ts'
import { IntegrationError, json } from '../integration/parse.ts'
import type { SnapshotChange } from '../integration/ri-notes.ts'
import type { MemberResolution, Json, ReviewFailureCode, RunExit } from './api-review-types.ts'
import type { ContractChange } from './attributes.ts'
import type { TaskBinding, TaskBindingV2 } from './binding.ts'
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
export const contractCodes = ['contract-exceeds-declared', 'contract-change-unknown'] as const
export type ContractCode = (typeof contractCodes)[number]
/**
 * One contract member that the card changed beyond its declared contract change. `change` is
 * null when the snapshot difference of the member is unknown.
 */
export type ContractFinding = {
  code: ContractCode
  member: string
  change: SnapshotChange | null
  declared: ContractChange
  message: string
  remedy: string
}
/**
 * The contract part of the check:
 *
 * - `not-needed`: the card changed no file under the `api` directory of a contract member, so
 *   the snapshot difference did not run.
 * - `skipped`: the card changed such files, but its version 1 binding declares no contract
 *   change.
 * - `checked`: the snapshot difference from taskBase to the working tree, for each member the
 *   card changed. `change` is null when the difference of the member is unknown.
 */
export type ContractCheck =
  | { kind: 'not-needed' }
  | { kind: 'skipped'; members: string[]; reason: string }
  | { kind: 'checked'; base: string; members: { path: string; change: SnapshotChange | null }[] }
/**
 * One failure of the semantic review of a card (`api-review-*` code), with the member it
 * concerns. The exit code of each code is in `integration/contract-review.ts`.
 */
export type SemanticFinding = {
  code: ReviewFailureCode
  member: string | null
  detail: Json
  message: string
  remedy: string
}
/**
 * The outcome of the semantic review path of a card. `levels` holds, for each review member
 * with a valid conclusion, the level that conclusion gives it.
 */
export type CardSemantic = {
  exit: RunExit
  rawExitCode: number | null
  findings: { code: ReviewFailureCode; member: string | null; detail: Json }[]
  members: MemberResolution[]
  levels: Record<string, 'additive' | 'breaking'>
}
export type CardReviewInput = {
  root: string
  binding: TaskBindingV2
  context: Context
  files: string[]
  touched: string[]
  lines: DeliveryLines
}
/**
 * The semantic review path of a card: `undefined` when the card Issue carries no review record,
 * so the conservative rule stands. The CLI wires it; without it nothing is read from the platform.
 */
export type CardReview = (input: CardReviewInput) => CardSemantic | undefined
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
      contract: ContractCheck
      findings: (ChangeFinding | ContractFinding | SemanticFinding)[]
      /** Present only when the semantic review path ran. */
      semantic?: CardSemantic
    }
/** Runs `omne-contract-api --diff <base>` on the working tree; a failure throws. */
export type DiffContractsFrom = (base: string) => DiffRun

/** Said after each remedy: a fast-forward or rebase sync also puts other commits on the chain. */
const SYNC_NOTE =
  '这个文件来自别人的提交时，多半是快进或 rebase 同步，或合并了只在本地的分支：改用 git merge --no-ff 合并远端跟踪分支，见 tools/dev-flow/src/delivery/README.md「改动的写范围与线归属」。'
const REMEDIES: Record<ChangeCode, string> = {
  'change-outside-scope': `撤回这个文件的改动。确实要改时，请调度者扩大写范围并重新派发，再提交这个改动。${SYNC_NOTE}`,
  'change-outside-line': `撤回这个文件的改动。别的线与联调轨道的路径由那条线的卡或交付线为 integration 的卡修改。${SYNC_NOTE}`,
}

function nameList(output: string): string[] {
  return output.split('\0').filter(file => file !== '')
}
/** Commits as `[commit, ...parents]`, from `git rev-list --parents`. */
function withParents(output: string): string[][] {
  return output
    .split('\n')
    .filter(line => line !== '')
    .map(line => line.split(' '))
}
/**
 * The files this card changed since `taskBase`, one commit at a time along the first-parent
 * chain of HEAD:
 *
 * - A commit with one parent gives every file it changes. Renames count as a deletion and an
 *   addition.
 * - A merge gives the files that differ from every parent (`diff-tree --cc`): conflict
 *   resolutions, changes made in the merge, and files that both sides changed.
 * - A merge also brings in the commits of its other parents. The ones on a remote-tracking
 *   branch other than `<remote>/<branch>` of the card belong to the target, the batch or another
 *   card and do not count. The others are the card's own work, for example a
 *   local side branch, and count like commits on the chain.
 * - The worktree adds tracked files that differ from HEAD and untracked files Git does not
 *   ignore.
 */
export function cardChanges(root: string, taskBase: string, branch: string): string[] {
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  requireAncestor(root, taskBase, head)
  const files = new Set<string>(),
    add = (output: string) => nameList(output).forEach(file => files.add(file))
  const changesOf = ([commit, ...parents]: string[]) => {
    if (commit === undefined) return
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
  const chain = withParents(
    git(root, ['rev-list', '--first-parent', '--parents', `${taskBase}..${head}`]),
  )
  for (const entry of chain) {
    changesOf(entry)
    const [, first, ...others] = entry
    if (first === undefined) continue
    for (const other of others)
      withParents(
        git(root, [
          'rev-list',
          '--parents',
          other,
          '--not',
          first,
          `--exclude=*/${branch}`,
          '--remotes',
        ]),
      ).forEach(changesOf)
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

/** The time limit of one `omne-contract-api --diff` run in the local check. */
export const CONTRACT_DIFF_TIMEOUT_MS = 120_000
/** The snapshot directory of a contract member, from `{member}/api/{package}.api.md`. */
const API_DIRECTORY = 'api'

/** The contract members with at least one changed file under their `api` directory, sorted. */
export function touchedContracts(files: readonly string[], members: Iterable<string>): string[] {
  return [...new Set(members)]
    .filter(member => files.some(file => file.startsWith(`${member}/${API_DIRECTORY}/`)))
    .sort()
}

const LEVEL = { none: 0, additive: 1, breaking: 2 } as const satisfies Record<
  ContractChange,
  number
>
/** The lowest declared level that covers each snapshot change. `review` needs `breaking`. */
const REQUIRED = {
  none: 'none',
  additive: 'additive',
  review: 'breaking',
} as const satisfies Record<SnapshotChange, ContractChange>
const CONTRACT_REMEDY =
  '撤回这个成员 api 目录与公开面的改动；或请调度者升卡的修订、按差异改契约变更并重新派发。线内的卡需要破坏性改动时，按交付协议「契约变更与里程碑类型」停下，交调度者组织裁定。'

/**
 * The findings for the members the card changed, against the declared contract change. An
 * additive change needs `additive` or `breaking`. A review change needs `breaking`. A member
 * whose difference is unreadable or missing from the run is `contract-change-unknown`.
 */
export function contractFindings(
  touched: readonly string[],
  run: DiffRun,
  declared: ContractChange,
): ContractFinding[] {
  return touched.flatMap((member): ContractFinding[] => {
    const entry = run.members.find(item => item.directory === member)
    if (entry === undefined || entry.status === 'invalid')
      return [
        {
          code: 'contract-change-unknown',
          member,
          change: null,
          declared,
          message:
            entry === undefined
              ? `omne-contract-api 的差异里没有 ${member}，本卡改了它的 api 目录。`
              : `${member} 的快照差异读不出：${entry.message}`,
          remedy:
            '修好这个成员的 package.json 或快照文件，让 omne-contract-api --diff 能读出差异，再重跑检查。',
        },
      ]
    if (LEVEL[REQUIRED[entry.change]] <= LEVEL[declared]) return []
    return [
      {
        code: 'contract-exceeds-declared',
        member,
        change: entry.change,
        declared,
        message: `${member} 自 taskBase 的快照差异为 ${entry.change}，本卡申报的契约变更为 ${declared}，${entry.change} 至少要申报 ${REQUIRED[entry.change]}。`,
        remedy: CONTRACT_REMEDY,
      },
    ]
  })
}

/** The installed `omne-contract-api --diff`; an unavailable result throws with its reason. */
function installedDiff(root: string): DiffContractsFrom {
  return base => {
    const command = contractApiCommand()
    if ('kind' in command) throw new IntegrationError('unknown', command.reason)
    const ran = runDiff(command, { root, base, timeoutMs: CONTRACT_DIFF_TIMEOUT_MS })
    if (ran.kind === 'unavailable') throw new IntegrationError('unknown', ran.reason)
    return parseDiffRun(ran.stdout)
  }
}
/** The contract members of a line table. */
function contractMembers(lines: DeliveryLines): string[] {
  return lines.lines.flatMap(line => line.contracts)
}
/**
 * The contract members of the working tree's line table, or none when the file is absent. A
 * card can add a member in this table, so the check reads it as well as the taskBase table.
 */
function workingMembers(root: string): string[] {
  const path = join(root, LINES_PATH)
  if (!existsSync(path)) return []
  return contractMembers(parseDeliveryLines(json(readFileSync(path, 'utf8'), LINES_PATH)))
}
/** The contract part of the check, with its findings and, when the diff ran, its result. */
function checkContracts(
  root: string,
  binding: TaskBinding,
  files: readonly string[],
  lines: DeliveryLines,
  diff: DiffContractsFrom,
): { contract: ContractCheck; findings: ContractFinding[]; touched: string[]; run?: DiffRun } {
  const touched = touchedContracts(files, [...contractMembers(lines), ...workingMembers(root)])
  if (touched.length === 0) return { contract: { kind: 'not-needed' }, findings: [], touched }
  if (binding.schemaVersion !== 2)
    return {
      contract: {
        kind: 'skipped',
        members: touched,
        reason: 'version 1 的 binding 没有契约变更字段，不核对契约差异。',
      },
      findings: [],
      touched,
    }
  const run = diff(binding.taskBase)
  if (run.commit !== binding.taskBase)
    throw new IntegrationError(
      'unknown',
      `omne-contract-api 比较的基线是 ${run.commit}，不是 taskBase ${binding.taskBase}`,
    )
  return {
    contract: {
      kind: 'checked',
      base: run.commit,
      members: touched.map(path => {
        const entry = run.members.find(item => item.directory === path)
        return { path, change: entry?.status === 'compared' ? entry.change : null }
      }),
    },
    findings: contractFindings(touched, run, binding.contractChange),
    touched,
    run,
  }
}
/** `run` with each review member that has a valid conclusion of `additive` counted as additive. */
function withSemanticLevels(run: DiffRun, levels: CardSemantic['levels']): DiffRun {
  return {
    ...run,
    members: run.members.map(member =>
      member.status === 'compared' &&
      member.change === 'review' &&
      levels[member.directory] === 'additive'
        ? { ...member, change: 'additive' }
        : member,
    ),
  }
}
const SEMANTIC_REMEDY =
  '按 docs/engineering/delivery.md#契约变更的语义复核 处置这个失败码：补全或更正记录与身份输入，不改申报去迎合结果。'
function semanticFinding(item: CardSemantic['findings'][number]): SemanticFinding {
  return {
    ...item,
    message: `${item.code}${item.member === null ? '' : ` ${item.member}`}`,
    remedy: SEMANTIC_REMEDY,
  }
}

/** The line table of `commit`, the table the card was dispatched against. */
function committedLines(root: string, commit: string): DeliveryLines {
  return parseDeliveryLines(
    json(git(root, ['show', `${commit}:${LINES_PATH}`]), `${commit}:${LINES_PATH}`),
  )
}
/**
 * The inputs of the semantic review of the card bound to this tree: the version 2 owner task, its
 * changed files and the contract members they touch. Throws when the tree is unbound or the owner
 * task has no version 2 binding.
 */
export function cardReviewInput(root: string): CardReviewInput {
  const actual = repository(root).root
  if (!existsSync(contextPath(actual)))
    throw new IntegrationError('input-error', 'The tree is unbound: no task context to review')
  const context = readContextFile(actual).context
  const binding = context.ownerTask
  if (binding === null || binding.schemaVersion !== 2)
    throw new IntegrationError('input-error', 'The semantic review needs a version 2 owner task')
  const lines = committedLines(actual, binding.taskBase),
    files = cardChanges(actual, binding.taskBase, binding.branch)
  return {
    root: actual,
    binding,
    context,
    files,
    touched: touchedContracts(files, [...contractMembers(lines), ...workingMembers(actual)]),
    lines,
  }
}
/**
 * Checks the changes of the card bound to this tree. Without a task context the tree is
 * unbound and nothing is checked. `linesFile` replaces the line table of taskBase.
 * `diffContracts` replaces the installed `omne-contract-api --diff`.
 */
export function changeScope({
  root,
  linesFile,
  diffContracts,
  review,
}: {
  root: string
  linesFile?: string
  diffContracts?: DiffContractsFrom
  review?: CardReview
}): ChangeScopeReport {
  const actual = repository(root).root
  if (!existsSync(contextPath(actual)))
    return { bound: false, message: '未绑定：本工作树没有 task context，不核对写范围与线归属。' }
  const context = readContextFile(actual).context
  const binding = context.ownerTask
  if (binding === null)
    throw new IntegrationError('input-error', 'The task context has no owner task to check')
  const lines =
      linesFile === undefined
        ? committedLines(actual, binding.taskBase)
        : parseDeliveryLines(json(readFileSync(linesFile, 'utf8'), linesFile)),
    files = cardChanges(actual, binding.taskBase, binding.branch),
    contract = checkContracts(actual, binding, files, lines, diffContracts ?? installedDiff(actual))
  const hasReview =
    contract.run?.members.some(
      member =>
        contract.touched.includes(member.directory) &&
        member.status === 'compared' &&
        member.change === 'review',
    ) ?? false
  if (review !== undefined && linesFile !== undefined && hasReview && binding.schemaVersion === 2)
    throw new IntegrationError(
      'input-error',
      '--lines cannot be combined with the semantic review of a card that has review members',
    )
  const semantic =
    review !== undefined && hasReview && binding.schemaVersion === 2
      ? review({ root: actual, binding, context, files, touched: contract.touched, lines })
      : undefined
  const contractResult =
    semantic === undefined || contract.run === undefined || binding.schemaVersion !== 2
      ? contract.findings
      : contractFindings(
          contract.touched,
          withSemanticLevels(contract.run, semantic.levels),
          binding.contractChange,
        )
  return {
    bound: true,
    issue: binding.issue.url,
    attempt: binding.attempt,
    taskBase: binding.taskBase,
    head: git(actual, ['rev-parse', 'HEAD']),
    files,
    contract: contract.contract,
    findings: [
      ...changeFindings(files, binding, lines),
      ...contractResult,
      ...(semantic?.findings.map(semanticFinding) ?? []),
    ],
    ...(semantic === undefined ? {} : { semantic }),
  }
}
