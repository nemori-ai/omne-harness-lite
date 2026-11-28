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
  view: McpPermission | Readonly<{ kind: 'ordinary' | 'secret'; item: string }>
  read: Readonly<{ kind: 'read' | 'reading' | 'failed' }>
  write: McpWrite
}>

export type McpEndpoint = Readonly<{ name: string; rows: readonly McpRow[] }>

/** How the last 新建 of this category stands; the receipt and the reasons are the governance port's sentences. */
export type McpCreating =
  | Readonly<{ kind: 'none' | 'sending' }>
  | Readonly<{ kind: 'unknown'; confirming: boolean; notice: McpNotice }>
  | Readonly<{ kind: 'done'; text: string }>
  | Readonly<{ kind: 'refused'; notice: McpNotice }>

export type McpSnapshot =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: McpNotice }>
  | Readonly<{
      kind: 'read'
      holdings: readonly McpEndpoint[]
      partial: boolean
      creating: McpCreating
    }>

/** The only JSON the MCP page writes: a text, and the body of an endpoint, an object of texts. */
export type McpText = Readonly<{ kind: 'string'; value: string }>
export type McpBody = Readonly<{
  kind: 'object'
  entries: readonly Readonly<{ key: string; value: McpText }>[]
}>

export type McpView = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => McpSnapshot
  read: () => void
  set: (key: string, pick: string) => void
  setValue: (key: string, value: McpText) => void
  setSecret: (key: string, secret: string) => void
  createFromData: (name: string, body: McpBody) => void
  confirmCreate: () => void
  clear: (key: string) => void
  confirm: (key: string) => void
  close: () => void
  Row: ComponentType<{ rowKey: string }>
}>

export type McpGovernance = Readonly<{
  open: (tenantText: string, category: string) => McpView
}>
