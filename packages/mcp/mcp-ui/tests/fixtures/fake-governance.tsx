import type { McpGovernance, McpRow, McpSnapshot, McpView } from '../../src/index.ts'

export const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

type Permission = Extract<McpRow['view'], { kind: 'permission' }>

export function permissionRow(
  overrides: Partial<Omit<McpRow, 'view'>> & { view?: Partial<Permission> } = {},
): McpRow {
  const { view, ...rest } = overrides
  return {
    key: 'permission',
    read: { kind: 'read' },
    write: { kind: 'none' },
    ...rest,
    view: {
      kind: 'permission',
      declaration: { title: '调用这个接入点的动作' },
      choices: [
        { value: 'deny', label: '禁止' },
        { value: 'ask', label: '询问' },
        { value: 'auto', label: '自动' },
      ],
      own: null,
      effective: { kind: 'value', value: 'ask' },
      editable: { kind: 'yes' },
      ...view,
    },
  }
}

export const otherRow = (
  key: string,
  kind: 'ordinary' | 'secret',
  item = key,
  write: McpRow['write'] = { kind: 'none' },
): McpRow => ({
  key,
  read: { kind: 'read' },
  write,
  view: { kind, item },
})

export const endpoint = (name: string, rows: readonly McpRow[]) => ({ name, rows })

export function readOf(
  ...holdings: ReturnType<typeof endpoint>[]
): Extract<McpSnapshot, { kind: 'read' }> {
  return { kind: 'read', holdings, partial: false, creating: { kind: 'none' } }
}

export type FakeGovernance = Readonly<{
  governance: McpGovernance
  calls: string[]
  opened: string[]
  show: (next: McpSnapshot) => void
}>

export function fakeGovernance(initial: McpSnapshot): FakeGovernance {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const calls: string[] = []
  const opened: string[] = []
  const view: McpView = {
    subscribe: listener => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    read: () => void calls.push('read'),
    set: (key, pick) => void calls.push(`set ${key} ${pick}`),
    setValue: (key, value) => void calls.push(`setValue ${key} ${value.value}`),
    setSecret: key => void calls.push(`setSecret ${key}`),
    createFromData: (name, body) =>
      void calls.push(
        `create ${name} ${body.entries.map(entry => `${entry.key}=${entry.value.value}`).join(',')}`,
      ),
    confirmCreate: () => void calls.push('confirmCreate'),
    clear: key => void calls.push(`clear ${key}`),
    confirm: key => void calls.push(`confirm ${key}`),
    close: () => void calls.push('close'),
    Row: ({ rowKey }) => <li data-default-row={rowKey}>{`默认部件：${rowKey}`}</li>,
  }
  return {
    governance: {
      open: (tenant, category) => {
        opened.push(`${category} ${tenant}`)
        return view
      },
    },
    calls,
    opened,
    show: next => {
      snapshot = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}
