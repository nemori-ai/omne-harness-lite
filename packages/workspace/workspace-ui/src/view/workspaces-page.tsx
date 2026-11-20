import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageColumn,
  PageHeader,
  Section,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@omne-harness/ui-kit'
import type {
  WorkspaceProtocol,
  WorkspaceSummaryBody,
  WorkspaceViewBody,
} from '@omne-harness/workspace-protocol'
import { useEffect, useState, type JSX } from 'react'
import { commit, recheck, type Pending, type Told } from '../model/commits.ts'
import { availabilityText, REFUSED_READS, standingText } from '../model/words.ts'

type Client = ClientOf<WorkspaceProtocol>
type Read<T> =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'read'; value: T }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

/** What registering a directory does, written where a person registers one. */
export const REGISTER_HINT =
  '登记一个目录，只是让它成为工作区：管谁能在这里工作、能不能读它的来源。' +
  '它不拦原本就能做的文件读写；命令在这个目录之外读写，也不归它管。'

const UNREAD = { kind: 'unread' } as const

function useRead<T>(
  read: () => Promise<Readonly<{ outcome: string; body?: unknown }>>,
  pick: (body: unknown) => T,
  key: string,
): Read<T> {
  const [state, set] = useState<Read<T>>(UNREAD)
  useEffect(() => {
    let live = true
    set(UNREAD)
    read().then(
      answer => {
        if (!live) return
        set(
          answer.outcome === 'succeeded'
            ? { kind: 'read', value: pick(answer.body) }
            : { kind: 'unreadable', reason: REFUSED_READS[answer.outcome] ?? answer.outcome },
        )
      },
      () => live && set({ kind: 'unreadable', reason: '没有送达' }),
    )
    return () => {
      live = false
    }
  }, [key])
  return state
}

export type WorkspacesPageProps = Readonly<{
  client: Client
  tenant: string
  newId?: () => string
}>

export function WorkspacesPage({
  client,
  tenant,
  newId = () => crypto.randomUUID(),
}: WorkspacesPageProps): JSX.Element {
  const owner = readTenantText(tenant)
  return (
    <PageColumn className="workspace-page">
      <PageHeader
        title="工作区"
        description="登记服务端机器上的目录，看你能在哪些工作区里工作，把别人加进来或移走。"
      />
      {owner === undefined ? (
        <EmptyState role="alert" title="读不懂当前的租户。" />
      ) : (
        <Workspaces client={client} tenant={owner} newId={newId} />
      )}
    </PageColumn>
  )
}

type Props = Readonly<{ client: Client; tenant: TenantId; newId: () => string }>

function useTold(client: Client) {
  const [told, setTold] = useState<Told | null>(null)
  const run = async (next: Promise<Told>, changed: () => void) => {
    const result = await next
    setTold(result)
    if (result.changed) changed()
  }
  const again = (pending: Pending, changed: () => void) => run(recheck(client, pending), changed)
  return { told, run, again }
}

function Workspaces({ client, tenant, newId }: Props): JSX.Element {
  const [round, reread] = useState(0)
  const [selected, select] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const { told, run, again } = useTold(client)
  const changed = () => reread(value => value + 1)
  const list = useRead(
    () => client.list({ tenant }),
    body => (body as { workspaces: readonly WorkspaceSummaryBody[] }).workspaces,
    `${String(tenant)}:${String(round)}`,
  )
  const register = () =>
    run(
      commit(client, { name: 'register', body: { tenant, operation: newId(), address } }),
      changed,
    )
  return (
    <>
      <Section id="workspace-register" title="登记">
        <Field id="workspace-register-address" label="要登记的目录" hint={REGISTER_HINT}>
          <Input
            id="workspace-register-address"
            value={address}
            onChange={event => setAddress(event.target.value)}
          />
        </Field>
        <Button disabled={address.trim() === ''} onClick={() => void register()}>
          登记
        </Button>
      </Section>
      {told === null ? null : <ToldLine told={told} onAgain={pending => again(pending, changed)} />}
      <Section id="workspace-list" title="你的工作区">
        <WorkspaceList list={list} onShow={select} />
      </Section>
      {selected === null ? null : (
        <WorkspaceDetail
          key={`${selected}:${String(round)}`}
          client={client}
          tenant={tenant}
          workspace={selected}
          onCommit={(pending: Pending) => run(commit(client, pending), changed)}
          newId={newId}
        />
      )}
    </>
  )
}

function ToldLine({
  told,
  onAgain,
}: Readonly<{ told: Told; onAgain: (pending: Pending) => Promise<void> }>): JSX.Element {
  const { pending } = told
  return (
    <p role="status" className="workspace-told">
      {told.text}
      {pending === null ? null : (
        <Button variant="outline" onClick={() => void onAgain(pending)}>
          再查一次
        </Button>
      )}
    </p>
  )
}

function WorkspaceList({
  list,
  onShow,
}: Readonly<{
  list: Read<readonly WorkspaceSummaryBody[]>
  onShow: (workspace: string) => void
}>): JSX.Element {
  if (list.kind === 'unread') return <p>正在读……</p>
  if (list.kind === 'unreadable') return <p role="alert">列不出：{list.reason}</p>
  if (list.value.length === 0) return <EmptyState title="还没有工作区。登记一个目录开始。" />
  return (
    <Table>
      <TableBody>
        {list.value.map(item => (
          <TableRow key={item.workspace}>
            <TableCell>{item.workspace}</TableCell>
            <TableCell>{item.type}</TableCell>
            <TableCell>{standingText(item.standing)}</TableCell>
            <TableCell>
              <Button
                variant="outline"
                aria-label={`查看 ${item.workspace}`}
                onClick={() => onShow(item.workspace)}
              >
                查看
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function WorkspaceDetail({
  client,
  tenant,
  workspace,
  onCommit,
  newId,
}: Readonly<{
  client: Client
  tenant: TenantId
  workspace: string
  onCommit: (pending: Pending) => Promise<void>
  newId: () => string
}>): JSX.Element {
  const [target, setTarget] = useState('')
  const [wrong, setWrong] = useState(false)
  const view = useRead(
    () => client.describe({ tenant, workspace }),
    body => body as WorkspaceViewBody,
    workspace,
  )
  const change = (name: 'grant-participation' | 'remove') => {
    const other = readTenantText(target.trim())
    setWrong(other === undefined)
    if (other === undefined) return
    void onCommit({ name, body: { tenant, operation: newId(), workspace, target: other } })
  }
  return (
    <Section id="workspace-detail" title={`工作区 ${workspace}`}>
      {view.kind === 'unread' ? <p>正在读……</p> : null}
      {view.kind === 'unreadable' ? <p role="alert">看不了：{view.reason}</p> : null}
      {view.kind === 'read' ? (
        <Table>
          <TableBody>
            {view.value.instances.map(instance => (
              <TableRow key={instance.instance}>
                <TableCell>{instance.address}</TableCell>
                <TableCell>{availabilityText(instance.availability)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Field id="workspace-target" label="对方的租户" hint="授予参与或移除的那个租户">
        <Input
          id="workspace-target"
          value={target}
          onChange={event => setTarget(event.target.value)}
        />
      </Field>
      {wrong ? <p role="alert">对方的租户读不懂</p> : null}
      <Button onClick={() => change('grant-participation')}>授予参与</Button>
      <Button variant="outline" onClick={() => change('remove')}>
        移除
      </Button>
    </Section>
  )
}
