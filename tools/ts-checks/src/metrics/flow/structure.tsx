/// <reference lib="dom" />
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  getBezierPath,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useKeyPress,
} from '@xyflow/react'
import type { EdgeRow, MemberRow, Report } from '../report.ts'
import { ZOOM_KEYS } from '../../arch/flow/graph.tsx'
import type { StructureFlowApi, StructureHandle, StructureProps } from './api.ts'
import { visibleEdges, worstOf, type EdgeState, type VisibleEdge } from './edges.ts'
import { structureLayout, type GroupBox, type LayerBox, type StructureLayout } from './layout.ts'

/** 评分 1（最差）到 10（最好）：不超过 5 在「差 → 中」之间取色，否则在「中 → 好」之间取色。 */
export function toneOf(grade: number, suffix: '' | '-fill'): string {
  return grade <= 5
    ? `color-mix(in srgb, var(--mid${suffix}) ${Math.round((grade / 5) * 100)}%, var(--bad${suffix}))`
    : `color-mix(in srgb, var(--good${suffix}) ${Math.round(((grade - 5) / 5) * 100)}%, var(--mid${suffix}))`
}

const num = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1))
const short = (path: string): string => path.split('/').pop() ?? path

interface MemberData extends Record<string, unknown> {
  readonly member: MemberRow
  readonly noData: boolean
  readonly selected: boolean
  /** 有选中或悬停的成员时，与它不相邻的成员淡化。 */
  readonly muted: boolean
  readonly incoming: readonly EdgeRow[]
  readonly outgoing: readonly EdgeRow[]
}
interface LayerData extends Record<string, unknown> {
  readonly box: LayerBox
}
interface GroupData extends Record<string, unknown> {
  readonly box: GroupBox
  readonly risk: number | undefined
  readonly grade: number | undefined
}
type MemberNode = Node<MemberData, 'member'>
type LayerNode = Node<LayerData, 'layer'>
type GroupNode = Node<GroupData, 'package'>
type StructureNode = MemberNode | LayerNode | GroupNode
interface FlowData extends Record<string, unknown> {
  readonly color: string
  /** 连着选中或悬停的成员：高亮并有沿线流动的小点。 */
  readonly active: boolean
}
type FlowEdge = Edge<FlowData, 'flow'>
type StructureInstance = ReactFlowInstance<StructureNode, FlowEdge>

/** 每个成员和组的左右两侧各有一进一出，连线按两端的左右关系选侧。 */
function Sides() {
  return (
    <>
      <Handle
        id="l-in"
        type="target"
        position={Position.Left}
        className="structure-handle"
        isConnectable={false}
      />
      <Handle
        id="l-out"
        type="source"
        position={Position.Left}
        className="structure-handle"
        isConnectable={false}
      />
      <Handle
        id="r-in"
        type="target"
        position={Position.Right}
        className="structure-handle"
        isConnectable={false}
      />
      <Handle
        id="r-out"
        type="source"
        position={Position.Right}
        className="structure-handle"
        isConnectable={false}
      />
    </>
  )
}

function LayerView({ data }: NodeProps<LayerNode>) {
  return (
    <div
      className={`structure-layer${data.box.layer === undefined ? ' structure-layer-unplaced' : ''}`}
    >
      <span className="structure-layer-label">{data.box.label}</span>
    </div>
  )
}

function GroupView({ data }: NodeProps<GroupNode>) {
  const stripe = data.grade === undefined ? 'var(--line)' : toneOf(data.grade, '')
  return (
    <div
      className="structure-group"
      style={{ borderLeftColor: stripe }}
      title={data.risk === undefined ? undefined : `组内最差成员的风险值 ${num(data.risk)}`}
    >
      <Sides />
      <span className="structure-group-name">{data.box.group}</span>
      {data.risk === undefined ? null : (
        <span className="structure-group-risk">{num(data.risk)}</span>
      )}
    </div>
  )
}

function MemberView({ data }: NodeProps<MemberNode>) {
  const { member } = data
  const classes = [
    'structure-card',
    data.noData ? 'structure-card-nodata' : '',
    member.changed ? 'structure-card-changed' : '',
    data.selected ? 'structure-card-selected' : '',
    data.muted ? 'structure-card-muted' : '',
  ]
    .filter(name => name !== '')
    .join(' ')
  const inTone = worstOf(data.incoming)
  const outTone = worstOf(data.outgoing)
  return (
    <div
      className={classes}
      style={
        data.noData
          ? undefined
          : { background: toneOf(member.grade, '-fill'), borderColor: toneOf(member.grade, '') }
      }
      data-member={member.path}
    >
      <Sides />
      <div className="structure-card-name">{short(member.path)}</div>
      <div className="structure-card-meta">
        {member.functions === 0 ? (
          <span className="structure-card-empty">无函数</span>
        ) : (
          <span className="structure-card-score">{num(member.risk)}</span>
        )}
        {member.changedOver > 0 ? (
          <span className="structure-card-delta">▲{member.changedOver}</span>
        ) : null}
        <span className="structure-card-links">
          {data.incoming.length > 0 ? (
            <span
              className={`structure-link structure-link-${inTone || 'plain'}`}
              title="依赖它的成员"
            >
              入 {data.incoming.length}
            </span>
          ) : null}
          {data.outgoing.length > 0 ? (
            <span
              className={`structure-link structure-link-${outTone || 'plain'}`}
              title="它依赖的成员"
            >
              出 {data.outgoing.length}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

// 不叫 group：React Flow 的默认样式给 group 类型的节点加内边距、边框与背景。
const NODE_TYPES = { member: MemberView, layer: LayerView, package: GroupView }

/** 小点沿线走一圈的时长，与参考架构快照一致。 */
const FLOW_DURATION = '1.6s'

/** 贝塞尔曲线：同侧出发的线各自弯向对端，不像直角走线那样共用竖段而叠成一条。 */
function FlowEdgeView(props: EdgeProps<FlowEdge>) {
  const [path] = getBezierPath(props)
  const { data, markerEnd, style } = props
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        {...(style === undefined ? {} : { style })}
      />
      {data?.active === true ? (
        <circle r={3.2} className="structure-flow-dot" style={{ fill: data.color }}>
          <animateMotion dur={FLOW_DURATION} repeatCount="indefinite" path={path} />
        </circle>
      ) : null}
    </>
  )
}

const EDGE_TYPES = { flow: FlowEdgeView }

/**
 * 线与箭头都用页面 token，内联 style 里的 var() 随深浅色切换即时生效。
 * 普通导入取发起成员卡片的颜色（从黄卡出发的线是黄的），组间连线取发起组左边线的颜色；
 * 红、橙、蓝仍留给违规、例外与变更。
 */
const EDGE_COLOR: Readonly<Record<'bad' | 'except' | 'changed', string>> = {
  bad: 'var(--bad)',
  except: 'var(--except)',
  changed: 'var(--changed)',
}

export function nodesOf(
  report: Report,
  layout: StructureLayout,
  selected: string | null,
): StructureNode[] {
  const members = new Map(report.members.map(member => [member.path, member]))
  const groups = new Map(report.layout.flat().map(group => [group.group, group]))
  const incoming = new Map<string, EdgeRow[]>()
  const outgoing = new Map<string, EdgeRow[]>()
  for (const edge of report.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
  }
  const neighbors = new Set(
    selected === null
      ? []
      : report.edges.flatMap(edge =>
          edge.from === selected ? [edge.to] : edge.to === selected ? [edge.from] : [],
        ),
  )
  const frame = { selectable: false, focusable: false, draggable: false } as const
  return [
    ...layout.layers.map((box): LayerNode => ({
      id: box.id,
      type: 'layer',
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      zIndex: -2,
      ...frame,
      data: { box },
    })),
    ...layout.groups.map((box): GroupNode => ({
      id: box.id,
      type: 'package',
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      zIndex: -1,
      ...frame,
      data: { box, risk: groups.get(box.group)?.risk, grade: groups.get(box.group)?.grade },
    })),
    ...layout.members.map((box): MemberNode => {
      const member = members.get(box.path)
      if (member === undefined) throw new Error(`Missing member row ${box.path}`)
      return {
        id: box.id,
        type: 'member',
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        draggable: false,
        selected: box.path === selected,
        ariaLabel: box.path,
        data: {
          member,
          noData: report.coverageEnabled && member.coverage === 'no-data',
          selected: box.path === selected,
          muted: selected !== null && box.path !== selected && !neighbors.has(box.path),
          incoming: incoming.get(box.path) ?? [],
          outgoing: outgoing.get(box.path) ?? [],
        },
      }
    }),
  ]
}

export function edgesOf(
  report: Report,
  layout: StructureLayout,
  visible: readonly VisibleEdge[],
  focus: string | null,
): FlowEdge[] {
  const grades = new Map<string, number>([
    ...report.members.map(member => [member.path, member.grade] as const),
    ...report.layout.flat().map(group => [`group:${group.group}`, group.grade] as const),
  ])
  const colorOf = (edge: VisibleEdge): string => {
    if (edge.tone !== 'plain' && edge.tone !== 'group') return EDGE_COLOR[edge.tone]
    const grade = grades.get(edge.from)
    return grade === undefined ? 'var(--edge)' : toneOf(grade, '')
  }
  const centers = new Map(
    [...layout.groups, ...layout.members].map(box => [box.id, box.x + box.width / 2]),
  )
  return visible.flatMap((edge): FlowEdge[] => {
    const from = centers.get(edge.from)
    const to = centers.get(edge.to)
    if (from === undefined || to === undefined) return []
    // 依赖方向朝左（内层在左）时从左侧出、进右侧；朝右反之；同一列时都走左侧绕出去。
    const [sourceHandle, targetHandle] =
      from > to ? ['l-out', 'r-in'] : from < to ? ['r-out', 'l-in'] : ['l-out', 'l-in']
    const color = colorOf(edge)
    const active = focus !== null && (edge.from === focus || edge.to === focus)
    const muted = focus !== null && !active
    // 组间连线一画出来就是要看的，与选中时一样加粗发光，但不放流动小点。
    const lit = active || edge.tone === 'group'
    return [
      {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        sourceHandle,
        targetHandle,
        type: 'flow',
        focusable: false,
        selectable: false,
        // 曲线不避让节点，会穿过卡片；放在卡片（zIndex 0）上层，被穿过的那段才看得见。
        zIndex: 1,
        className: [
          'structure-edge',
          `structure-edge-${edge.tone}`,
          active ? 'structure-edge-active' : '',
          muted ? 'structure-edge-muted' : '',
        ]
          .filter(name => name !== '')
          .join(' '),
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        style: {
          stroke: color,
          strokeWidth: lit ? Math.max(edge.width + 0.6, 2) : edge.width,
          ...(lit ? { filter: `drop-shadow(0 0 3px ${color})` } : {}),
          ...(edge.dashed ? { strokeDasharray: '6 3' } : {}),
        },
        data: { color, active },
      },
    ]
  })
}

function minimapColor(node: StructureNode): string {
  if (node.type === 'member') return toneOf(node.data.member.grade, '')
  return 'transparent'
}

/** 离开卡片后等这么久再撤掉悬停：鼠标跨过卡片间的空隙时，连线不至于闪一下。 */
const HOVER_RELEASE_MS = 120

function Structure({
  props,
  layout,
  state,
  instance,
}: {
  readonly props: StructureProps
  readonly layout: StructureLayout
  readonly state: EdgeState
  readonly instance: RefObject<StructureInstance | null>
}) {
  const zoomKeyHeld = useKeyPress(ZOOM_KEYS)
  // 悬停在成员上等同于临时选中它：画它的线、描它的边框；离开后回到点击定下的选中。
  const [hovered, setHovered] = useState<string | null>(null)
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(release.current), [])
  const shown = hovered ?? state.selected
  const nodes = useMemo(() => nodesOf(props.report, layout, shown), [props.report, layout, shown])
  const edges = useMemo(
    () =>
      edgesOf(
        props.report,
        layout,
        visibleEdges(props.report, { ...state, selected: shown }).edges,
        shown,
      ),
    [props.report, layout, state, shown],
  )
  const hover = (id: string | null): void => {
    clearTimeout(release.current)
    if (id !== null) setHovered(id)
    else release.current = setTimeout(() => setHovered(null), HOVER_RELEASE_MS)
  }
  const clear = (): void => {
    if (state.selected !== null) props.onSelect(null)
  }
  return (
    <div className="structure-flow">
      <ReactFlow<StructureNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.06, maxZoom: 1.2 }}
        minZoom={0.05}
        maxZoom={3}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        zoomActivationKeyCode={ZOOM_KEYS}
        preventScrolling={zoomKeyHeld}
        panOnDrag={[0, 1]}
        colorMode="system"
        onInit={flow => {
          instance.current = flow
        }}
        // 点层或组的空白区域与点画布空白一样，取消选中。
        onNodeClick={(_, node) => {
          if (node.type === 'member') props.onSelect(node.id)
          else clear()
        }}
        onNodeMouseEnter={(_, node) => hover(node.type === 'member' ? node.id : null)}
        onNodeMouseMove={(event, node) => {
          if (node.type === 'member') props.onHover(event.nativeEvent, node.id)
          else props.onLeave()
        }}
        onNodeMouseLeave={(_, node) => {
          if (node.type === 'member') hover(null)
          props.onLeave()
        }}
        onPaneClick={clear}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <MiniMap
          pannable
          zoomable
          nodeColor={minimapColor}
          nodeStrokeWidth={0}
          style={{ width: 180, height: 72 }}
        />
      </ReactFlow>
    </div>
  )
}

export const structureFlow: StructureFlowApi = {
  mount(container: HTMLElement, props: StructureProps): StructureHandle {
    const layout = structureLayout(props.report)
    const root = createRoot(container)
    const instance: { current: StructureInstance | null } = { current: null }
    return {
      update(selection) {
        const state = { ...selection, limit: props.changedEdgeLimit }
        root.render(<Structure props={props} layout={layout} state={state} instance={instance} />)
        // 说明只对点击定下的状态给出；悬停是临时的，不改底栏的说明。
        return visibleEdges(props.report, state).note
      },
      zoomIn: () => void instance.current?.zoomIn({ duration: 180 }),
      zoomOut: () => void instance.current?.zoomOut({ duration: 180 }),
      fitView: () => void instance.current?.fitView({ padding: 0.06, maxZoom: 1.2, duration: 220 }),
      unmount: () => root.unmount(),
    }
  },
}
