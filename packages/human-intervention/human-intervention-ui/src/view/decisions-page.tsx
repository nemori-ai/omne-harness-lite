import type { HumanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { CardsDriver } from '../model/cards-driver.ts'
import type { State } from '../model/cards-machine.ts'
import { CardView } from './card-view.tsx'
import { NoticeLine } from './notice.tsx'

export type DecisionsPageProps = Readonly<{
  client: ClientOf<HumanInterventionProtocol>
  tenant: string
}>

export function DecisionsPage(props: DecisionsPageProps): JSX.Element {
  const tenant = useMemo(() => readTenantText(props.tenant), [props.tenant])
  if (tenant === undefined)
    return (
      <PageColumn className="hitl-decisions">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，这一页不能工作。' }} />
      </PageColumn>
    )
  return <Loader client={props.client} tenant={tenant} />
}

function Loader({
  client,
  tenant,
}: {
  readonly client: ClientOf<HumanInterventionProtocol>
  readonly tenant: TenantId
}) {
  const [driver, setDriver] = useState<CardsDriver | null>(null)
  useEffect(() => {
    const created = new CardsDriver({ client, tenant })
    setDriver(created)
    created.readList()
    return () => created.dispose()
  }, [client, tenant])
  return driver === null ? <PageColumn className="hitl-decisions" /> : <Decisions driver={driver} />
}

function Decisions({ driver }: { readonly driver: CardsDriver }) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  return (
    <PageColumn className="hitl-decisions">
      <PageHeader
        title="待你决定"
        description="Agent 提的问题、要你批准的动作"
        actions={
          <Button
            variant="outline"
            disabled={state.read.kind === 'reading'}
            onClick={() => driver.readList()}
          >
            刷新
          </Button>
        }
      />
      {state.last === null ? null : <NoticeLine notice={state.last} />}
      <Body state={state} driver={driver} />
    </PageColumn>
  )
}

function Body({ state, driver }: { readonly state: State; readonly driver: CardsDriver }) {
  const read = state.read
  const entries = state.entries
  return (
    <>
      {read.kind === 'failed' ? (
        <NoticeLine
          notice={read.notice}
          action={{ label: '重试', onClick: () => driver.readList() }}
        />
      ) : null}
      {read.kind === 'read' && read.partial ? (
        <NoticeLine
          notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
        />
      ) : null}
      {entries.length > 0 ? (
        <ul className="hitl-cards">
          {entries.map(entry => (
            <CardView key={entry.key} entry={entry} driver={driver} />
          ))}
        </ul>
      ) : read.kind === 'read' ? (
        <EmptyState title="现在没有要你决定的事" />
      ) : read.kind === 'failed' ? null : (
        <LoadingState label="正在读取……" />
      )}
    </>
  )
}
