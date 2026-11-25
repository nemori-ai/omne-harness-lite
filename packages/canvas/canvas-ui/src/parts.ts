import { definePart } from '@omne-harness/shell-contract'

export const canvasView = definePart({
  name: 'canvas.view',
  label: '画布',
  summary: '反面上的画布：纸面、它上面的提示，与下沿的状态栏',
  within: 'shell.app',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const canvasPaper = definePart({
  name: 'canvas.paper',
  label: '纸',
  summary: '画布上有边的一张纸，大小与网格由服务端给；能平移、缩放，纸上摆着东西',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '读到画布之后',
})

export const canvasStatus = definePart({
  name: 'canvas.status',
  label: '状态栏',
  summary: '纸下沿的一条窄栏：查找、磁吸开关、远近的读数，与看着的那一样是什么、谁摆的、什么时候',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '读到画布之后',
})

export const canvasParts = [canvasView, canvasPaper, canvasStatus] as const
