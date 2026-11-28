import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import {
  defineRenderPoint,
  SPEAKS_AS_SYSTEM,
  type RenderDrawer,
  type RenderPointSink,
} from '@omne-harness/shell-contract'
import { FactList, FactRow, Segmented } from '@omne-harness/ui-kit'
import { createContext, useContext, useState, type JSX, type ReactNode } from 'react'
import { humanInterventionPaperCardDetail } from '../parts.ts'

type Question = HumanInterventionCardItem['card']['question']
type Detail = NonNullable<Extract<Question, { kind: 'release' }>['detail']>
export type GivenDetail = Extract<Detail, { state: 'given' }>

const point = defineRenderPoint<string>({
  name: 'human-intervention.release-detail',
  title: '放行卡的详情',
  summary:
    'How the typed value in the detail of a release card is drawn, by the domain that owns its kind.',
  key: 'the kind of the typed value, with its major version',
  scopes: SPEAKS_AS_SYSTEM,
})

export const declareReleaseDetail = point.declare

/** A tool's own UI puts the drawing of the typed value under its kind; without one, the card draws the rows. */
export const releaseDetail: RenderPointSink<string> = { name: point.name, put: point.put }

export const DetailHost = createContext<RenderDrawer | undefined>(undefined)

function Rows({ rows }: Readonly<{ rows: GivenDetail['rows'] }>): JSX.Element {
  return (
    <FactList className="hitl-detail-rows">
      {rows.map((row, index) => (
        <FactRow key={index} term={row.label}>
          {typeof row.value === 'string' ? (
            row.value
          ) : (
            <ul className="hitl-detail-list">
              {row.value.map((entry, at) => (
                <li key={at}>{entry}</li>
              ))}
            </ul>
          )}
        </FactRow>
      ))}
    </FactList>
  )
}

type Face = 'view' | 'rows'

const FACES = [
  { value: 'view', label: '工具的画法' },
  { value: 'rows', label: '条目' },
] as const

function Switchable({ view, rows }: Readonly<{ view: ReactNode; rows: ReactNode }>): JSX.Element {
  const [face, setFace] = useState<Face>('view')
  return (
    <div className="hitl-detail" {...humanInterventionPaperCardDetail.props}>
      <Segmented label="详情的画法" value={face} onValueChange={setFace} options={FACES} />
      {face === 'rows' ? rows : view}
    </div>
  )
}

export function ReleaseDetailView({ detail }: Readonly<{ detail: GivenDetail }>): ReactNode {
  const host = useContext(DetailHost)
  const rows = <Rows rows={detail.rows} />
  const plain = (
    <div className="hitl-detail" {...humanInterventionPaperCardDetail.props}>
      {rows}
    </div>
  )
  if (detail.typed === undefined || host === undefined) return plain
  return point.draw(
    host,
    detail.typed.kind,
    detail.typed.value,
    () => plain,
    view => <Switchable view={view} rows={rows} />,
  )
}
