import type { McpProtocol } from '@omne-harness/mcp-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { ComponentType } from 'react'

type Client = ClientOf<McpProtocol>

/** Without `observe` the page reads only when it opens and after a refresh; without connecting an OAuth endpoint shows no button. */
export type McpStatus = Pick<Client, 'read-endpoint' | 'refresh-endpoint'> &
  Partial<Pick<Client, 'begin-connect' | 'disconnect'>> &
  Readonly<{ observe?: Pick<Client['observe'], 'observe-endpoints'> }>

export type McpNotice = Readonly<{ kind: 'refused' | 'unavailable' | 'unknown'; text: string }>

export type McpPermission = Readonly<{
  kind: 'permission'
  declaration: Readonly<{ title: string }>
  choices: readonly Readonly<{ value: string; label: string }>[]
  own: string | null
  effective:
    | Readonly<{ kind: 'value'; value: string }>
    | Readonly<{ kind: 'prohibited' | 'empty-bound' }>
  editable: Readonly<{ kind: 'yes' | 'no' }>
}>

export type McpWrite =
  | Readonly<{ kind: 'none' | 'submitting' | 'succeeded' }>
  | Readonly<{ kind: 'unknown'; confirming: boolean; notice: McpNotice }>
  | Readonly<{ kind: 'unconfirmed' | 'refused'; notice: McpNotice }>

export type McpRow = Readonly<{
  key: string
  view: McpPermission | Readonly<{ kind: 'ordinary' | 'secret' }>
  read: Readonly<{ kind: 'read' | 'reading' | 'failed' }>
  write: McpWrite
}>

export type McpEndpoint = Readonly<{ name: string; rows: readonly McpRow[] }>

export type McpSnapshot =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: McpNotice }>
  | Readonly<{ kind: 'read'; holdings: readonly McpEndpoint[]; partial: boolean }>

export type McpView = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => McpSnapshot
  read: () => void
  set: (key: string, pick: string) => void
  clear: (key: string) => void
  confirm: (key: string) => void
  close: () => void
  Row: ComponentType<{ rowKey: string }>
}>

export type McpGovernance = Readonly<{
  open: (tenantText: string, category: string) => McpView
}>
