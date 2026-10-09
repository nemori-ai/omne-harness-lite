/// <reference lib="dom" />
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
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
import type { Band } from '../../metrics/report.ts'
import type { ViewEdge, ViewNode } from '../view.ts'
import type { FlowProps } from './api.ts'
import { edgeStroke, nodeAnnotations, nodeTitle } from './export-svg.ts'
import { NODE_HEIGHT, NODE_WIDTH, positionsOf, routesOf, type EdgeRoute } from './geometry.ts'

interface ArchNodeData extends Record<string, unknown> {
  readonly node: ViewNode
  readonly kind: string
  readonly annotations: readonly string[]
  readonly focused: boolean
  readonly deviations: number
  readonly band: Band | undefined
}
interface ArchEdgeData extends Record<string, unknown> {
  readonly edge: ViewEdge
  readonly route: EdgeRoute
}
type ArchNode = Node<ArchNodeData, 'arch'>
type ArchEdge = Edge<ArchEdgeData, 'elk'>
export type ArchInstance = ReactFlowInstance<ArchNode, ArchEdge>

const CHANGE_TEXT = { present: '', added: '新增', removed: '已删除 · BASE' } as const
const MINIMAP_COLOR = {
  green: '#8fc99a',
  yellow: '#e0c35a',
  red: '#e08a7c',
  service: '#9db7e6',
  event: '#c5a6e6',
  member: '#b8bec6',
  group: '#9cbfae',
  external: '#d6d9dd',
} as const

function ArchNodeView({ data }: NodeProps<ArchNode>) {
  const { node } = data
  const classes = [
    'arch-node',
    `arch-node-${node.kind}`,
    `arch-node-${node.change}`,
    data.focused ? 'arch-node-focused' : '',
    node.kind === 'external' ? 'arch-node-inert' : '',
    data.band === undefined ? '' : `arch-band-${data.band}`,
  ]
    .filter(name => name !== '')
    .join(' ')
  const title = nodeTitle(node)
  return (
    <div className={classes} title={node.member ?? node.label} data-node-id={node.id}>
      <Handle
        type="target"
        position={Position.Left}
        className="arch-handle"
        isConnectable={false}
      />
      <div className="arch-node-kind">
        <span className="arch-node-kind-text">{data.kind}</span>
        {CHANGE_TEXT[node.change] === '' ? null : (
          <span className="arch-node-change">{CHANGE_TEXT[node.change]}</span>
        )}
        {data.deviations > 0 ? (
          <span className="arch-node-deviation" data-conformance="deviation">
            偏离 {data.deviations}
          </span>
        ) : null}
      </div>
      <div className="arch-node-title">{title}</div>
      <div className="arch-node-meta">
        {data.annotations.map(text => (
          <span key={text}>{text}</span>
        ))}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="arch-handle"
        isConnectable={false}
      />
    </div>
  )
}

/** The path is ELK's routed polyline; the island never computes geometry of its own. */
function ElkEdgeView({ id, data, markerEnd, style }: EdgeProps<ArchEdge>) {
  if (data === undefined) return null
  return (
    <>
      <BaseEdge
        id={id}
        path={data.route.d}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        {...(style === undefined ? {} : { style })}
      />
      <EdgeLabelRenderer>
        {data.route.labels.map((label, index) => (
          <div
            key={index}
            className="arch-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
          >
            {label.text}
          </div>
        ))}
      </EdgeLabelRenderer>
    </>
  )
}

/** ⌘ on macOS, Ctrl elsewhere. Held: the wheel zooms the canvas. Released: the wheel scrolls the page. */
export const ZOOM_KEYS = ['Meta', 'Control']

const NODE_TYPES = { arch: ArchNodeView }
const EDGE_TYPES = { elk: ElkEdgeView }

export interface FlowElements {
  readonly nodes: ArchNode[]
  readonly edges: ArchEdge[]
}

export function elementsOf(props: FlowProps): FlowElements {
  const positions = positionsOf(props.layout)
  const routes = routesOf(props.layout)
  const nodes = props.selected.nodes.map((node): ArchNode => {
    const position = positions.get(node.id)
    if (position === undefined) throw new Error('Missing node geometry')
    const band =
      props.overlays.complexity && node.complexity !== undefined && node.complexity.functions > 0
        ? node.complexity.band
        : undefined
    return {
      id: node.id,
      type: 'arch',
      position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ariaLabel: node.member ?? node.label,
      selected: node.id === props.focus,
      // External code dependencies have no group to expand into; they are drawn, not navigated.
      selectable: node.kind !== 'external',
      focusable: node.kind !== 'external',
      data: {
        node,
        kind: props.kindOf(node),
        annotations: nodeAnnotations(node, props),
        focused: node.id === props.focus,
        deviations: props.overlays.conformance ? (props.violations[node.id] ?? 0) : 0,
        band,
      },
    }
  })
  const edges = props.selected.edges.map((edge): ArchEdge => {
    const route = routes.get(edge.id)
    if (route === undefined) throw new Error('Missing edge geometry')
    const stroke = edgeStroke(edge.change)
    const dashed =
      edge.kind === 'type-import' || edge.kind === 'optional' || edge.change === 'removed'
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'elk',
      ariaLabel: `${props.relations[edge.kind]} ${edge.label}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 },
      style: { stroke, strokeWidth: 1.6, ...(dashed ? { strokeDasharray: '6 4' } : {}) },
      data: { edge, route },
    }
  })
  return { nodes, edges }
}

function minimapColor(node: ArchNode): string {
  return MINIMAP_COLOR[node.data.band ?? node.data.node.kind]
}

export function Graph({
  props,
  elements,
  instance,
}: {
  readonly props: FlowProps
  readonly elements: FlowElements
  readonly instance: RefObject<ArchInstance | null>
}) {
  const zoomKeyHeld = useKeyPress(ZOOM_KEYS)
  const activate = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target instanceof Element ? event.target : null
    const node = target?.closest<HTMLElement>('.react-flow__node') ?? null
    const edge = node === null ? (target?.closest<HTMLElement>('.react-flow__edge') ?? null) : null
    const id = node?.dataset['id'] ?? edge?.dataset['id']
    if (id === undefined) return
    event.preventDefault()
    if (node === null) props.onEdge(id)
    else if (!node.classList.contains('arch-node-inert')) props.onNode(id)
  }
  return (
    <div className="arch-flow" onKeyDownCapture={activate}>
      <ReactFlow<ArchNode, ArchEdge>
        nodes={elements.nodes}
        edges={elements.edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.2 }}
        minZoom={0.05}
        maxZoom={3}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        zoomActivationKeyCode={ZOOM_KEYS}
        preventScrolling={zoomKeyHeld}
        panOnDrag={[0, 1]}
        edgesFocusable
        elementsSelectable
        colorMode="system"
        onInit={flow => {
          instance.current = flow
        }}
        onNodeClick={(_, node) => {
          if (node.data.node.kind !== 'external') props.onNode(node.id)
        }}
        onEdgeClick={(_, edge) => props.onEdge(edge.id)}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <MiniMap pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={0} />
      </ReactFlow>
    </div>
  )
}
