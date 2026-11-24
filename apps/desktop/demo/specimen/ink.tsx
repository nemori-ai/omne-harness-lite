import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AppointmentIcon,
  AwaitingIcon,
  Button,
  colorSchemeQuery,
  ContactIcon,
  createThemeController,
  FigureSeat,
  FigureStage,
  InkBubble,
  MaterialIcon,
  MatterIcon,
  ResourceIcon,
  StateWord,
  ToldNote,
  TopicsIcon,
  type Box,
  type BubbleInk,
  type Doing,
  type FigureMoment,
  type Told,
} from '@omne-harness/ui-kit'
import { casual } from '../../../../packages/frontend/ui-kit/dist/ink/casual.js'
import './ink.css'

createThemeController({
  read: () => 'system',
  write: () => undefined,
  system: colorSchemeQuery(),
}).start()

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEAT_NAMES = ['home', 'header', 'gate'] as const
type SeatName = (typeof SEAT_NAMES)[number]
const asSeat = (value: unknown): SeatName => SEAT_NAMES.find(name => name === value) ?? 'home'

const query = new URLSearchParams(window.location.search)
const seed = Number(query.get('seed') ?? Number.NaN)
if (Number.isFinite(seed)) casual.use(seeded(seed))
const STILL = query.has('still')
const FIRST_SEAT = asSeat(query.get('seat'))
const FIRST_WAITING = Math.max(0, Math.round(Number(query.get('waiting') ?? 0) || 0))

const TOLD = {
  short: '时间到了：该给阳台的花浇水啦。',
  three: '提醒：下午三点和设计组对一下新版首页的配色，带上上周的草图。',
  four: '提醒：明早九点前把季度报告发给财务，附上三张图表和一页摘要，再抄送部门的两位同事。',
  long: '22:57 了，该把窗户关上啦。夜里开窗睡觉的要点：一是保持空气流通，二是注意保暖，三是关好纱窗。',
} as const
type ToldKind = keyof typeof TOLD

const WORK = [
  { icon: MatterIcon, title: '整理本周的会议纪要', state: 'completed' },
  { icon: TopicsIcon, title: '给阳台的花换一个大盆', state: 'working' },
  { icon: ResourceIcon, title: '核对十一月的信用卡账单', state: 'approval' },
  { icon: AppointmentIcon, title: '预订周六晚上的餐厅', state: 'completed' },
  { icon: ContactIcon, title: '回复房东关于续租的邮件', state: 'reply' },
  { icon: MaterialIcon, title: '备份手机里的照片', state: 'queued' },
  { icon: AwaitingIcon, title: '查明天去机场的路线', state: 'completed' },
  { icon: MatterIcon, title: '续订视频网站的会员', state: 'paused' },
] as const

const SAID: Record<Doing | 'idle', string> = {
  idle: 'Agent 闲着',
  thinking: 'Agent 在想',
  looking: 'Agent 在查',
  writing: 'Agent 在写',
  background: 'Agent 在后台做事',
}

type Row = [at: number, figure: number, way: number, note: number]
const timeline: Row[] = []
const OFFSET = 2166136261
const mix = (hash: number, word: number): number => Math.imul(hash ^ word, 16777619)

function hashText(text: string, hash: number): number {
  let next = hash
  for (let i = 0; i < text.length; i += 1) next = mix(next, text.charCodeAt(i))
  return next
}

function hashCanvas(canvas: HTMLCanvasElement, hash: number): number {
  if (canvas.width === 0 || canvas.height === 0) return hash
  const context = canvas.getContext('2d')
  if (context === null) return hash
  const words = new Uint32Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer)
  let next = hash
  for (let i = 0; i < words.length; i += 1) next = mix(next, words[i] ?? 0)
  return next
}

function digest(selector: string, look: (element: HTMLElement) => string): number {
  let hash = OFFSET
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    hash = hashText(look(element), hash)
    for (const canvas of element.querySelectorAll('canvas')) hash = hashCanvas(canvas, hash)
  }
  return hash
}

const TRACKS: readonly (readonly [string, (element: HTMLElement) => string])[] = [
  ['.omne-figure-carried', element => `${element.style.transform}|${element.dataset['phase']}`],
  [
    '.omne-figure-remnant',
    element => `${element.style.opacity}|${element.style.left}|${element.style.top}`,
  ],
  [
    '.omne-ink-bubble',
    element =>
      [
        element.style.getPropertyValue('--omne-ink-bubble-paper'),
        element.dataset['ink'],
        ...Array.from(
          element.querySelectorAll<SVGPathElement>('.omne-ink-bubble-edge path'),
          path => path.style.opacity,
        ),
      ].join('|'),
  ],
]

let seen: number[] = []
let changedAt = 0

function watch(now: number): void {
  const next = TRACKS.map(([selector, look]) => digest(selector, look))
  const moved = next.map((value, i) => (value === seen[i] ? 0 : 1))
  timeline.push([Math.round(now * 10) / 10, moved[0] ?? 0, moved[1] ?? 0, moved[2] ?? 0])
  if (timeline.length > 40_000) timeline.splice(0, 20_000)
  if (moved.includes(1)) changedAt = now
  seen = next
  requestAnimationFrame(watch)
}
requestAnimationFrame(watch)

type Step = readonly [at: number, what: string, value?: unknown]

const page = window as unknown as {
  __inkTimeline: Row[]
  __inkZero: number
  __ink?: unknown
}
page.__inkTimeline = timeline
page.__inkZero = 0

interface Opened {
  readonly key: number
  readonly closing: boolean
  readonly figure: Box
  readonly side: 'below' | 'right'
  readonly room: number
}

function placeFor(seat: SeatName): Omit<Opened, 'key' | 'closing'> {
  const box = document.querySelector(`[data-figure-seat="${seat}"]`)?.getBoundingClientRect()
  const figure =
    box === undefined
      ? { x: 0, y: 0, width: 0, height: 0 }
      : { x: box.left, y: box.top, width: box.width, height: box.height }
  return {
    figure,
    side: seat === 'header' ? 'below' : 'right',
    room: window.innerHeight - 12 - (figure.y + figure.height + 2),
  }
}

function Controls(props: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div className="ink-controls-row" role="group" aria-label={props.title}>
      <span className="ink-controls-title">{props.title}</span>
      {props.children}
    </div>
  )
}

function InkPage(): React.JSX.Element {
  const [doing, setDoing] = useState<Doing | undefined>(undefined)
  const [moment, setMoment] = useState<FigureMoment | undefined>(undefined)
  const [waiting, setWaiting] = useState(FIRST_WAITING)
  const [seat, setSeat] = useState<SeatName>(FIRST_SEAT)
  const [opened, setOpened] = useState<Partial<Record<BubbleInk, Opened>>>({})
  const [told, setTold] = useState<Told | null>(null)
  const [ready, setReady] = useState(false)
  const serial = useRef(0)
  const toldSerial = useRef(0)
  const where = useRef<SeatName>(FIRST_SEAT)

  useEffect(() => {
    where.current = seat
  }, [seat])
  useEffect(() => {
    if (STILL) casual.setStill(true)
  }, [])

  const say = useCallback((kind: FigureMoment['kind']) => {
    serial.current += 1
    setMoment({ kind, serial: serial.current })
  }, [])
  const bubble = useCallback((ink: BubbleInk, on?: boolean) => {
    const placing = placeFor(where.current)
    setOpened(was => {
      const now = was[ink]
      const shown = now !== undefined && !now.closing
      if (!(on ?? !shown)) return shown ? { ...was, [ink]: { ...now, closing: true } } : was
      if (shown) return was
      return { ...was, [ink]: { key: (now?.key ?? 0) + 1, closing: false, ...placing } }
    })
  }, [])
  const gone = useCallback((ink: BubbleInk, key: number) => {
    setOpened(was => {
      const now = was[ink]
      if (now === undefined || now.key !== key || !now.closing) return was
      const { [ink]: _, ...rest } = was
      return rest
    })
  }, [])
  const tell = useCallback((kind: ToldKind | null) => {
    toldSerial.current += 1
    setTold(kind === null ? null : { id: `told-${toldSerial.current}`, text: TOLD[kind] })
  }, [])

  useEffect(() => {
    const closeAll = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      bubble('full', false)
      bubble('light', false)
    }
    window.addEventListener('keydown', closeAll)
    return () => window.removeEventListener('keydown', closeAll)
  }, [bubble])

  useEffect(() => {
    const act = (what: string, value: unknown): void => {
      if (what === 'doing') setDoing((value ?? undefined) as Doing | undefined)
      else if (what === 'moment') say(value as FigureMoment['kind'])
      else if (what === 'waiting') setWaiting(Number(value))
      else if (what === 'go') setSeat(asSeat(value))
      else if (what === 'bubble') bubble(value as BubbleInk)
      else if (what === 'told') tell((value ?? null) as ToldKind | null)
      else if (what === 'click') document.querySelector<HTMLElement>(String(value))?.click()
      else if (what === 'key')
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key: String(value), bubbles: true }),
        )
    }
    page.__ink = {
      act,
      play(started: number, steps: readonly Step[]): void {
        const zero = started - performance.timeOrigin
        page.__inkZero = zero
        for (const [at, what, value] of steps)
          setTimeout(() => act(what, value), Math.max(0, zero + at - performance.now()))
      },
      settled(quiet = 600, most = 8000): Promise<number> {
        const began = performance.now()
        return new Promise(resolve => {
          const check = (): void => {
            const now = performance.now()
            if (now - changedAt >= quiet || now - began >= most) resolve(now - changedAt)
            else setTimeout(check, 50)
          }
          check()
        })
      },
    }
    setReady(true)
  }, [say, bubble, tell])

  const { full, light } = opened
  return (
    <FigureStage doing={doing} moment={moment} waiting={waiting} label={SAID[doing ?? 'idle']}>
      <div className="ink-page" data-specimen={ready ? 'ready' : 'loading'}>
        <div className="ink-sidebar" aria-hidden="true" />
        {SEAT_NAMES.map(name => (
          <FigureSeat
            key={name}
            name={name}
            priority={name === seat ? 2 : 1}
            className="ink-seat"
          />
        ))}
        <main className="ink-controls" aria-label="墨迹">
          <Controls title="状态">
            {(['idle', 'thinking', 'looking', 'writing', 'background'] as const).map(name => (
              <Button
                key={name}
                size="compact"
                variant={(doing ?? 'idle') === name ? 'default' : 'outline'}
                onClick={() => setDoing(name === 'idle' ? undefined : name)}
              >
                {SAID[name].replace('Agent ', '')}
              </Button>
            ))}
          </Controls>
          <Controls title="一次性的事">
            {(['received', 'landed', 'could-not'] as const).map(kind => (
              <Button key={kind} size="compact" variant="outline" onClick={() => say(kind)}>
                {kind}
              </Button>
            ))}
          </Controls>
          <Controls title="待答数">
            {[0, 1, 3, 12].map(count => (
              <Button
                key={count}
                size="compact"
                variant={waiting === count ? 'default' : 'outline'}
                onClick={() => setWaiting(count)}
              >
                {count}
              </Button>
            ))}
          </Controls>
          <Controls title="走到">
            {(
              [
                ['home', '家'],
                ['header', '对话头'],
                ['gate', '门'],
              ] as const
            ).map(([name, word]) => (
              <Button
                key={name}
                size="compact"
                variant={seat === name ? 'default' : 'outline'}
                onClick={() => setSeat(name)}
              >
                {word}
              </Button>
            ))}
          </Controls>
          <Controls title="墨框">
            <Button size="compact" variant="outline" onClick={() => bubble('full')}>
              开关浓墨框
            </Button>
            <Button size="compact" variant="outline" onClick={() => bubble('light')}>
              开关淡墨框
            </Button>
          </Controls>
          <Controls title="告知笺">
            {(
              [
                ['short', '短的'],
                ['three', '三行的'],
                ['four', '四行的'],
                ['long', '长的（截成三行）'],
              ] as const
            ).map(([kind, word]) => (
              <Button key={kind} size="compact" variant="outline" onClick={() => tell(kind)}>
                {word}
              </Button>
            ))}
            <Button size="compact" variant="outline" onClick={() => tell(null)}>
              点掉
            </Button>
          </Controls>
        </main>
        {full !== undefined && (
          <InkBubble
            key={`full-${full.key}`}
            as="section"
            className="ink-note"
            aria-label="浓墨框"
            figure={full.figure}
            side={full.side}
            ink="full"
            closing={full.closing}
            onGone={() => gone('full', full.key)}
          >
            <p className="ink-note-words">浓墨的框：边用浓墨写，写完干成一圈淡边。</p>
          </InkBubble>
        )}
        {light !== undefined && (
          <InkBubble
            key={`light-${light.key}`}
            as="section"
            className="ink-panel"
            aria-label="最近的工作"
            figure={light.figure}
            side={light.side}
            ink="light"
            closing={light.closing}
            onGone={() => gone('light', light.key)}
            style={{ maxHeight: light.room }}
          >
            <h2 className="ink-panel-title">
              最近的工作 <span className="ink-panel-count">49</span>
            </h2>
            <ul className="ink-panel-list">
              {WORK.map(({ icon: Icon, title, state }) => (
                <li key={title} className="ink-panel-row">
                  <Icon className="ink-panel-icon" />
                  <span className="ink-panel-text">
                    <span className="ink-panel-name">{title}</span>
                    <StateWord state={state} />
                  </span>
                  <span className="ink-panel-more" aria-hidden="true">
                    ›
                  </span>
                </li>
              ))}
            </ul>
          </InkBubble>
        )}
        <ToldNote said={told} onOpen={() => tell(null)} />
      </div>
    </FigureStage>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<InkPage />)
