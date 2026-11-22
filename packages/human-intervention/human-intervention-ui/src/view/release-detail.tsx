import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { defineKeyedPoint, type KeyedPointSink, type PointHost } from '@omne-harness/shell-contract'
import { FactList, FactRow, Segmented } from '@omne-harness/ui-kit'
import { Component, createContext, useContext, useState, type JSX, type ReactNode } from 'react'

type Question = HumanInterventionCardItem['card']['question']
type Detail = NonNullable<Extract<Question, { kind: 'release' }>['detail']>
export type GivenDetail = Extract<Detail, { state: 'given' }>

const point = defineKeyedPoint<string>({
  name: 'human-intervention.release-detail',
  subject: { encode: value => value, decode: text => text },
})

const Fallback = createContext<ReactNode>(null)

class Guarded extends Component<Readonly<{ children: ReactNode }>, Readonly<{ failed: boolean }>> {
  override state = { failed: false }

  static getDerivedStateFromError(): Readonly<{ failed: boolean }> {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <Fallback.Consumer>{rows => rows}</Fallback.Consumer>
    ) : (
      this.props.children
    )
  }
}

function Drawn({ draw }: Readonly<{ draw: () => ReactNode }>): ReactNode {
  return draw()
}

export const declareReleaseDetail = point.declare

// A tool's own UI draws the typed value under its kind; whatever it throws, the card draws the rows.
export const releaseDetail: KeyedPointSink<string> = {
  name: point.name,
  contribute: (shell, key, item) =>
    point.contribute(shell, key, {
      ...item,
      render: props => (
        <Guarded>
          <Drawn draw={() => item.render(props)} />
        </Guarded>
      ),
    }),
}

export const DetailHost = createContext<PointHost | undefined>(undefined)

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
    <div className="hitl-detail">
      <Segmented label="详情的画法" value={face} onValueChange={setFace} options={FACES} />
      {face === 'rows' ? rows : view}
    </div>
  )
}

export function ReleaseDetailView({ detail }: Readonly<{ detail: GivenDetail }>): JSX.Element {
  const host = useContext(DetailHost)
  const rows = <Rows rows={detail.rows} />
  const plain = <div className="hitl-detail">{rows}</div>
  if (detail.typed === undefined || host === undefined) return plain
  return (
    <Fallback.Provider value={plain}>
      {point.slot(host, detail.typed.kind, detail.typed.value, entries => {
        const first = entries[0]
        return first === undefined ? plain : <Switchable view={first.node} rows={rows} />
      })}
    </Fallback.Provider>
  )
}
