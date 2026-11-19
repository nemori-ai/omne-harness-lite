import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { defineKeyedPoint, type KeyedPointSink, type PointHost } from '@omne-harness/shell-contract'
import { Button } from '@omne-harness/ui-kit'
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
    <dl className="hitl-release-rows">
      {rows.map((row, index) => (
        <div key={index} className="hitl-release-row">
          <dt>{row.label}</dt>
          <dd>
            {typeof row.value === 'string' ? (
              row.value
            ) : (
              <ul>
                {row.value.map((entry, at) => (
                  <li key={at}>{entry}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Switchable({ view, rows }: Readonly<{ view: ReactNode; rows: ReactNode }>): JSX.Element {
  const [plain, setPlain] = useState(false)
  return (
    <div className="hitl-release-detail">
      {plain ? rows : view}
      <Button variant="ghost" size="compact" onClick={() => setPlain(!plain)}>
        {plain ? '看工具的画法' : '看条目'}
      </Button>
    </div>
  )
}

export function ReleaseDetailView({ detail }: Readonly<{ detail: GivenDetail }>): JSX.Element {
  const host = useContext(DetailHost)
  const rows = <Rows rows={detail.rows} />
  if (detail.typed === undefined || host === undefined) return rows
  return (
    <Fallback.Provider value={rows}>
      {point.slot(host, detail.typed.kind, detail.typed.value, entries => {
        const first = entries[0]
        return first === undefined ? rows : <Switchable view={first.node} rows={rows} />
      })}
    </Fallback.Provider>
  )
}
