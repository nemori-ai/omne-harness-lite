import type { GoalView } from '@omne-harness/goal-protocol'
import { writeJsonText } from '@omne-harness/json-text'
import {
  Ago,
  Button,
  CloseIcon,
  EditIcon,
  IconButton,
  InlineConfirm,
  InlineNotice,
  Input,
  LoadingState,
  OpenIcon,
  PauseIcon,
  PlayIcon,
  Prose,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StateWord,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Textarea,
} from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { GoalDriver, PanelState } from '../model/goal-driver.ts'
import {
  amountKey,
  bodyOf,
  changesOf,
  DRAFTER_WORDS,
  editsOf,
  howOf,
  limitsOf,
  readerOf,
  readingOf,
  SECTION_WORDS,
  settlingExit,
  SOURCE_WORDS,
  standingOf,
  unitOf,
  VIA_WORDS,
  type Body,
  type Edits,
} from '../model/panel.ts'
import { goalPanel } from '../parts.ts'

const UNREAD: Readonly<Record<Exclude<PanelState['read'], 'read' | 'loading'>, string>> = {
  denied: '你不能看这个会话的目标。',
  'not-found': '找不到这个会话。',
  unavailable: '服务端现在答不了，目标读不到。',
}
const STATUS_WORDS: Readonly<Record<string, string>> = {
  'not-started': '还没开始',
  doing: '在做',
  'claimed-done': '自认做完',
  blocked: '卡住了',
}

function Heading({ children }: { readonly children: ReactNode }) {
  return <h3 className="goal-heading">{children}</h3>
}

function GapTable({ goal }: { readonly goal: GoalView }) {
  return (
    <Table className="goal-gap">
      <TableBody>
        {goal.gap.map(row => (
          <TableRow key={row.id} data-open={row.open ? 'yes' : 'no'} data-reading={row.value}>
            <TableCell className="goal-gap-id">{row.id}</TableCell>
            <TableCell>
              {row.ought}
              {howOf(row) === null ? null : <span className="goal-how">{howOf(row)}</span>}
              {row.short === null || row.short === '' ? null : (
                <span className="goal-how">{row.short}</span>
              )}
            </TableCell>
            <TableCell className="goal-gap-reading">
              {readingOf(row)}
              {readerOf(row) === null ? null : (
                <span className="goal-quiet">
                  （{SOURCE_WORDS[readerOf(row) ?? ''] ?? readerOf(row)}）
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

type Told = Readonly<{
  criteria?: Readonly<Record<string, Readonly<{ status?: string; note?: string }>>>
  obstacle?: Readonly<{ what?: string }> | null
  deliverables?: readonly string[]
  notes?: readonly string[]
}>

function Progress({ goal }: { readonly goal: GoalView }) {
  const told = useMemo(() => JSON.parse(writeJsonText(goal.progress)) as Told, [goal.progress])
  const criteria = Object.entries(told.criteria ?? {})
  const lines = [...(told.deliverables ?? []), ...(told.notes ?? [])]
  if (criteria.length === 0 && lines.length === 0 && !told.obstacle)
    return <p className="goal-quiet">agent 还没有记进展。</p>
  return (
    <ul className="goal-list">
      {criteria.map(([id, entry]) => (
        <li key={id}>
          <span className="goal-gap-id">{id}</span>
          {STATUS_WORDS[entry.status ?? ''] ?? entry.status}
          {entry.note ? <span className="goal-quiet"> · {entry.note}</span> : null}
        </li>
      ))}
      {told.obstacle?.what ? <li>阻碍：{told.obstacle.what}</li> : null}
      {lines.map(line => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

function History({ goal }: { readonly goal: GoalView }) {
  return (
    <ol className="goal-list">
      {goal.history.map(entry => (
        <li key={entry.revision}>
          修订 {entry.revision} · {VIA_WORDS[entry.via]} · {DRAFTER_WORDS[entry.draftedBy]}
          <span className="goal-quiet" title={`确认者 ${entry.confirmedBy}`}>
            {' · '}
            <Ago at={entry.at} />
          </span>
          {entry.words ? <blockquote className="goal-words">{entry.words}</blockquote> : null}
        </li>
      ))}
    </ol>
  )
}

function Form({
  body,
  state,
  onSubmit,
  onClose,
}: {
  readonly body: Body
  readonly state: PanelState
  readonly onSubmit: (changes: readonly unknown[]) => void
  readonly onClose: () => void
}) {
  const [edits, setEdits] = useState<Edits>(() => editsOf(body))
  const [problem, setProblem] = useState<string | null>(null)
  const stated = (id: string, text: string) =>
    setEdits(before => ({ ...before, statements: { ...before.statements, [id]: text } }))
  const amounted = (key: string, text: string) =>
    setEdits(before => ({ ...before, amounts: { ...before.amounts, [key]: text } }))
  const submit = () => {
    const found = changesOf(body, edits)
    setProblem(found.kind === 'problem' ? found.problem : null)
    if (found.kind === 'changes') onSubmit(found.changes)
  }
  const found = state.issues.map(
    issue => `${issue.entry === null ? '' : `${issue.entry} `}${issue.field}：${issue.problem}`,
  )
  const problems = problem === null ? found : [problem, ...found]
  return (
    <form
      className="goal-form"
      aria-label="改目标"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="goal-field">
        <span>目的</span>
        <Textarea
          value={edits.purpose}
          onChange={event => setEdits(before => ({ ...before, purpose: event.target.value }))}
        />
      </label>
      {body.sections.map(section =>
        section.entries.length === 0 ? null : (
          <fieldset key={section.name} className="goal-fieldset">
            <legend>{SECTION_WORDS[section.name]}</legend>
            {section.entries.map(entry => (
              <div key={entry.id} className="goal-field">
                <span className="goal-gap-id">{entry.id}</span>
                {edits.statements[entry.id] === undefined ? null : (
                  <Input
                    aria-label={`${entry.id} 的陈述`}
                    value={edits.statements[entry.id]}
                    onChange={event => stated(entry.id, event.target.value)}
                  />
                )}
                {limitsOf(entry).map((limit, index) => (
                  <label key={limit.unit} className="goal-amount">
                    <Input
                      className="goal-amount-field"
                      aria-label={`${entry.id} 的上限（${unitOf(limit.unit)}）`}
                      inputMode="numeric"
                      value={edits.amounts[amountKey(entry.id, index)] ?? ''}
                      onChange={event => amounted(amountKey(entry.id, index), event.target.value)}
                    />
                    <span className="goal-quiet">{unitOf(limit.unit)}</span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        ),
      )}
      {problems.length === 0 ? null : (
        <InlineNotice tone="caution">
          <ul className="goal-list">
            {problems.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
      <div className="goal-actions">
        <Button type="submit" size="compact" disabled={state.busy !== null}>
          改成这样
        </Button>
        <IconButton type="button" label="不改了" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
    </form>
  )
}

function Actions({
  goal,
  state,
  driver,
  onEdit,
}: {
  readonly goal: GoalView
  readonly state: PanelState
  readonly driver: GoalDriver
  readonly onEdit: () => void
}) {
  const { status, attendance } = goal.state
  if (status === 'settled') return null
  if (attendance === 'unattended')
    return <p className="goal-quiet">这个会话无人值守，目标由建它的一方管，这里只读。</p>
  const busy = state.busy !== null
  const exit = settlingExit(goal.state)
  return (
    <div className="goal-actions">
      {status === 'active' ? (
        <IconButton
          label="暂停目标"
          disabled={busy}
          onClick={() => void driver.command({ kind: 'pause' })}
        >
          <PauseIcon />
        </IconButton>
      ) : (
        <IconButton
          label="恢复目标"
          disabled={busy}
          onClick={() => void driver.command({ kind: 'resume' })}
        >
          <PlayIcon />
        </IconButton>
      )}
      <IconButton label="改目标" disabled={busy} onClick={onEdit}>
        <EditIcon />
      </IconButton>
      {exit === null ? null : (
        <InlineConfirm
          tone="default"
          variant="outline"
          size="compact"
          confirmLabel={`照 ${exit} 收场`}
          consequence="目标照这条退出收场，之后不能恢复。"
          pending={state.busy === 'settle-by-exit'}
          disabled={busy}
          onConfirm={() => void driver.command({ kind: 'settle-by-exit', exit })}
        >
          照 {exit} 收场
        </InlineConfirm>
      )}
      <InlineConfirm
        tone="danger"
        confirmLabel="取消目标"
        cancelLabel="留着"
        consequence="目标收场为被取消，不算成功也不算失败。正在跑的这一轮不会停。"
        pending={state.busy === 'cancel'}
        disabled={busy}
        aria-label="取消目标"
        onConfirm={() => void driver.command({ kind: 'cancel' })}
      >
        <CloseIcon />
      </InlineConfirm>
    </div>
  )
}

const TENANT_SET = 'tenant'

/** Which decision model judges this session: the one the session chose for itself, or what the tenant set. Shown only when the server told the choice. */
function JudgeChoiceRow({ state, driver }: Readonly<{ state: PanelState; driver: GoalDriver }>) {
  const { judge } = state
  if (judge === null) return null
  const chosen = judge.model ?? TENANT_SET
  const wordOf = (value: string) => (value === TENANT_SET ? '照租户的设置' : value)
  return (
    <div className="goal-judge">
      <span className="goal-quiet">判定用的型号</span>
      <Select
        value={chosen}
        disabled={state.busy !== null}
        onValueChange={value => void driver.chooseJudge(value === TENANT_SET ? null : value)}
      >
        <SelectTrigger aria-label="这段会话判定用的型号" size="sm">
          <SelectValue>{wordOf(chosen)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {[TENANT_SET, ...judge.models].map(value => (
            <SelectItem key={value} value={value}>
              {wordOf(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export type GoalPanelProps = Readonly<{
  driver: GoalDriver
  /** Opens another session; absent where the panel is shown with nowhere to go. */
  onOpenSession?: (session: string) => void
}>

export function GoalPanel({ driver, onOpenSession }: GoalPanelProps) {
  const state = useSyncExternalStore(driver.subscribe, driver.getState)
  const [editing, setEditing] = useState(false)
  useEffect(() => driver.retain(), [driver])
  const goal = state.goal
  const body = useMemo(() => (goal === null ? null : bodyOf(goal)), [goal])
  if (state.read !== 'read')
    return (
      <section className="goal-panel" {...goalPanel.props} aria-label="目标">
        {state.read === 'loading' ? (
          <LoadingState label="正在读这段会话的目标" />
        ) : (
          <InlineNotice tone="caution">{UNREAD[state.read]}</InlineNotice>
        )}
      </section>
    )
  if (goal === null || body === null)
    return (
      <section className="goal-panel" {...goalPanel.props} aria-label="目标">
        <p className="goal-quiet">
          这段会话没有目标。在对话里敲 /goal 加一句你想要什么，就能设一个。
        </p>
      </section>
    )
  const standing = standingOf(goal.state)
  const { examiner } = goal
  return (
    <section className="goal-panel" {...goalPanel.props} aria-label="目标">
      <header className="goal-head">
        <StateWord state={standing.state} />
        <span className="goal-quiet">
          {standing.detail === null ? '' : `${standing.detail} · `}修订 {goal.state.revision} · 用了{' '}
          {goal.state.rounds} 轮
        </span>
        <Actions goal={goal} state={state} driver={driver} onEdit={() => setEditing(true)} />
      </header>
      {state.notice === null ? null : (
        <InlineNotice tone="caution" onDismiss={driver.dismiss}>
          {state.notice}
        </InlineNotice>
      )}
      {editing ? (
        <Form
          body={body}
          state={state}
          onClose={() => {
            driver.dismiss()
            setEditing(false)
          }}
          onSubmit={changes =>
            void driver.revise(changes).then(written => {
              if (written) setEditing(false)
            })
          }
        />
      ) : null}
      <div className="goal-heading-row">
        <Heading>做到哪了</Heading>
        {examiner === undefined || onOpenSession === undefined ? null : (
          <IconButton label="打开查验会话" onClick={() => onOpenSession(examiner)}>
            <OpenIcon aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <GapTable goal={goal} />
      <JudgeChoiceRow state={state} driver={driver} />
      <Heading>正文</Heading>
      <div className="goal-body">
        <Prose text={goal.rendered} unlinked />
      </div>
      <Heading>agent 记的进展</Heading>
      <Progress goal={goal} />
      <Heading>来历</Heading>
      <History goal={goal} />
    </section>
  )
}
