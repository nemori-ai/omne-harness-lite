import type { WorkspaceInstanceBody, WorkspaceSummaryBody } from '@omne-harness/workspace-protocol'

const REASONS: Readonly<Record<string, string>> = {
  'not-a-participant': '对方还不是这个工作区的参与者',
  'owner-needs-none': '拥有者不需要授予',
  'not-an-admin': '对方不是管理员',
  'type-unknown': '不认识这种工作区的类型',
  occupied: '这个目录已经属于另一个工作区',
  gone: '这个工作区已经不在了',
  busy: '这个工作区正忙，稍后再试',
  'invalid-request': '请求的写法不对',
}

/** A refusal of the workspace domain as a person reads it; a code it does not know is shown as is. */
export const reasonText = (reason: string): string => REASONS[reason] ?? reason

const STANDINGS: Readonly<Record<WorkspaceSummaryBody['standing'], string>> = {
  participant: '参与者',
  admin: '管理员',
  owner: '拥有者',
}

export const standingText = (standing: WorkspaceSummaryBody['standing']): string =>
  STANDINGS[standing]

export function availabilityText(availability: WorkspaceInstanceBody['availability']): string {
  switch (availability.kind) {
    case 'available':
      return `可用：${availability.directory}`
    case 'unavailable':
      return `用不了：${reasonText(availability.reason)}`
    case 'unknown':
      return '现在不知道能不能用'
  }
}

export const REFUSED_READS: Readonly<Record<string, string>> = {
  denied: '没有权限看工作区',
  'basis-unavailable': '工作区暂时读不到',
  'protocol-rejected': '请求不合协议',
  'not-found': '没有这个工作区',
}
