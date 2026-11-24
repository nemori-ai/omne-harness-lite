import { definePart } from '@omne-harness/shell-contract'

export const canvasView = definePart({
  name: 'canvas.view',
  label: '画布',
  summary: '反面上的画布：能滚动的一块，纸在里面',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const canvasPaper = definePart({
  name: 'canvas.paper',
  label: '纸',
  summary: '画布上有边的一张纸，大小与网格由服务端给',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '读到画布之后',
})

export const canvasParts = [canvasView, canvasPaper] as const
