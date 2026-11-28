import { FactList, FactRow } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { readActivation } from '../model/activation.ts'
import { scheduleActivation } from '../parts.ts'

/** What a release would bring into effect, drawn from the call's typed value on the card. Anything
 * it cannot read throws, and the card draws the rows instead. */
export function ActivationDetail({ value }: Readonly<{ value: string }>): JSX.Element {
  const activation = readActivation(value)
  if (activation === undefined) throw new Error('not a schedule activation')
  const { next } = activation
  return (
    <div className="schedule-activation" {...scheduleActivation.props}>
      <FactList>
        <FactRow term="动作">{activation.action}</FactRow>
        <FactRow term="日程">{activation.name}</FactRow>
      </FactList>
      {next.kind === 'times' ? (
        <ol className="schedule-upcoming" aria-label="接下来三次">
          {next.times.map(time => (
            <li key={time}>{time}</li>
          ))}
        </ol>
      ) : (
        <p className="schedule-note">
          {next.kind === 'none' ? '这一动作之后不再执行。' : '接下来几次取不到。'}
        </p>
      )}
    </div>
  )
}
