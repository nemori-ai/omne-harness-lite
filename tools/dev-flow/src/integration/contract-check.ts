import { contractApiCommand, runContractApi, type ContractApiCommand } from './contract-diff.ts'
import { array, choice, IntegrationError, json, object, string } from './parse.ts'

/** The member statuses of `omne-contract-api --check --json` in the pinned version. */
export const CHECK_STATUSES = [
  'match',
  'differs',
  'unreadable',
  'missing',
  'unbuilt',
  'invalid',
] as const
export type CheckStatus = (typeof CHECK_STATUSES)[number]
/** The statuses that fail the check. `match` passes; `unbuilt` only reports. */
export const FAILING_STATUSES = ['differs', 'unreadable', 'missing', 'invalid'] as const
type FailingStatus = (typeof FAILING_STATUSES)[number]

/** One member of the CLI's check result, reduced to the fields this command reads. */
type CheckMember = { directory: string; status: CheckStatus; message: string | undefined }
/** The fields of one `omne-contract-api --check --json` run that this command reads. */
export type CheckRun = { typescript: string; members: CheckMember[] }

/** One contract member whose snapshot and dist do not agree, with the way to fix it. */
export type CheckFailure = {
  member: string
  status: FailingStatus
  message: string
  remedy: string
}
export type ContractCheckReport = {
  typescript: string
  /** The number of members in each status. */
  counts: Record<CheckStatus, number>
  failures: CheckFailure[]
  /** Members without dist. The impact plan did not build them, so they only report. */
  unbuilt: string[]
}

/** The time limit of one `omne-contract-api --check` run. It reads the dist of every member. */
export const CONTRACT_CHECK_TIMEOUT_MS = 300_000

const WRITE = '运行 `pnpm run contract:api --write`，核对快照的改动后提交'
const FAILURE_TEXT: Record<FailingStatus, { message: string; remedy: string }> = {
  differs: {
    message: '快照文件与 dist 现场生成的快照不一致',
    remedy: `先重新构建这个成员（pnpm turbo run build --filter=<包名>），再运行检查：dist 可能早于合并进来的快照。仍不一致且公开面的改动是本卡要做的时，${WRITE}。不是要做的改动时，改回声明后重新构建。`,
  },
  unreadable: {
    message: '快照文件读不回（格式版本不对或被改坏）',
    remedy: `${WRITE}。`,
  },
  missing: {
    message: '没有快照文件',
    remedy: `${WRITE}。`,
  },
  invalid: {
    message: '成员声明不全或 dist 有编译诊断，没有生成快照',
    remedy: '修好成员 package.json 的 exports 或声明中的诊断，重新构建后再运行检查。',
  },
}

function parseMember(value: unknown, path: string): CheckMember {
  const v = object(value, path)
  return {
    directory: string(v.directory, `${path}.directory`),
    status: choice(v.status, CHECK_STATUSES, `${path}.status`),
    message: v.message === undefined ? undefined : string(v.message, `${path}.message`),
  }
}
/** Parses the CLI's standard output at the boundary; a shape defect throws `IntegrationError`. */
export function parseCheckRun(text: string): CheckRun {
  const v = object(json(text, 'omne-contract-api --check --json'), 'check')
  return {
    typescript: string(v.typescript, 'check.typescript'),
    members: array(v.members, 'check.members').map((item, index) =>
      parseMember(item, `check.members[${index}]`),
    ),
  }
}

function isFailing(status: CheckStatus): status is FailingStatus {
  const failing: readonly CheckStatus[] = FAILING_STATUSES
  return failing.includes(status)
}
/** Counts the statuses and lists the failing and the unbuilt members in the CLI's order. */
export function judgeCheck(run: CheckRun): ContractCheckReport {
  const counts = Object.fromEntries(CHECK_STATUSES.map(status => [status, 0])) as Record<
    CheckStatus,
    number
  >
  const failures: CheckFailure[] = [],
    unbuilt: string[] = []
  for (const member of run.members) {
    counts[member.status] += 1
    if (member.status === 'unbuilt') unbuilt.push(member.directory)
    if (!isFailing(member.status)) continue
    const text = FAILURE_TEXT[member.status]
    failures.push({
      member: member.directory,
      status: member.status,
      message: `${member.directory}：${text.message}${member.message === undefined ? '' : `：${member.message}`}。`,
      remedy: text.remedy,
    })
  }
  return { typescript: run.typescript, counts, failures, unbuilt }
}
/** 1 when any member fails, otherwise 0. */
export function contractCheckExitCode(report: ContractCheckReport): 0 | 1 {
  return report.failures.length > 0 ? 1 : 0
}

/**
 * Runs `omne-contract-api --check --json` on the checkout `root` with the pinned CLI and judges
 * it. A missing CLI, a failed process or output of another shape throws `IntegrationError`.
 */
export function runContractCheck({
  root,
  timeoutMs = CONTRACT_CHECK_TIMEOUT_MS,
  command,
}: {
  root: string
  timeoutMs?: number
  command?: ContractApiCommand
}): ContractCheckReport {
  const resolved = command ?? contractApiCommand()
  if ('kind' in resolved) throw new IntegrationError('unknown', resolved.reason)
  const ran = runContractApi(resolved, ['--check', '--json'], { root, timeoutMs })
  if (ran.kind === 'unavailable') throw new IntegrationError('unknown', ran.reason)
  return judgeCheck(parseCheckRun(ran.stdout))
}

/** The summary line of one report, for standard error. */
export function checkSummary(report: ContractCheckReport): string {
  const c = report.counts,
    total = Object.values(c).reduce((sum, count) => sum + count, 0)
  return `契约 API 快照（TypeScript ${report.typescript}）：${total} 个契约成员，${c.match} 个一致，${c.differs} 个不一致，${c.missing} 个没有快照，${c.unreadable} 个快照读不回，${c.invalid} 个声明不全，${c.unbuilt} 个没有 dist（只报告）`
}
