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

export const canvasItem = definePart({
  name: 'canvas.item',
  label: '纸上的一页',
  summary: '纸上摆着的一样东西：能挪、改大小、选中、锁上；里面画的归那一类东西的领域',
  within: 'canvas.paper',
  depths: ['tokens', 'style'],
  when: '纸上摆着东西时',
})

export const canvasPile = definePart({
  name: 'canvas.pile',
  label: '一摞',
  summary: '叠成一叠的几页：能挪、打开、改名、散开',
  within: 'canvas.paper',
  depths: ['tokens', 'style'],
  when: '纸上有一叠时',
})

export const canvasFinder = definePart({
  name: 'canvas.finder',
  label: '查找',
  summary: '在纸上打开的查找：一行字，下面按类列出能摆上来的，与拿走了的',
  within: 'canvas.paper',
  depths: ['tokens', 'style'],
  when: '查找打开时',
})

export const canvasMark = definePart({
  name: 'canvas.mark',
  label: '落点与找到的记号',
  summary: '纸上暂时的记号：拖文件进来时的落点，与圈出被找到的、已经摆着的那一样',
  within: 'canvas.paper',
  depths: ['tokens', 'style'],
  when: '拖文件进来之后，或找到一样已经摆着的东西之后',
})

export const canvasHome = definePart({
  name: 'canvas.home',
  label: '回正面的钮',
  summary: '纸正中的钮，里面坐着 Agent 形；按它回到正面',
  within: 'canvas.paper',
  depths: ['tokens', 'style'],
  when: '读到画布之后',
})

export const canvasTurn = definePart({
  name: 'canvas.turn',
  label: '「翻到正面」的记号',
  summary: '反面一角的记号，按它翻到正面',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '登录之后',
})

export const canvasParts = [
  canvasView,
  canvasPaper,
  canvasStatus,
  canvasItem,
  canvasPile,
  canvasFinder,
  canvasMark,
  canvasHome,
  canvasTurn,
] as const
