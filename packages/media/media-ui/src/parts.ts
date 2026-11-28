import { definePart } from '@omne-harness/shell-contract'

export const mediaTray = definePart({
  name: 'media.tray',
  label: '附件区',
  summary: '输入区里放附件的地方',
  within: 'session.composer',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const mediaTrayChip = definePart({
  name: 'media.tray.chip',
  label: '一个附件',
  summary: '选好要发的一个附件',
  within: 'media.tray',
  depths: ['tokens', 'style'],
  when: '有附件时',
})

export const mediaTrayAttach = definePart({
  name: 'media.tray.attach',
  label: '加附件',
  summary: '选图片、语音或 PDF',
  within: 'media.tray',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const mediaTrayScreenshot = definePart({
  name: 'media.tray.screenshot',
  label: '截图',
  summary: '截一张屏幕，作为图片附件',
  within: 'media.tray',
  depths: ['tokens', 'style'],
  when: '宿主截得了这台机器的屏幕时',
})

export const mediaTrayRecord = definePart({
  name: 'media.tray.record',
  label: '录音',
  summary: '按住说话',
  within: 'media.tray',
  depths: ['tokens', 'style'],
  when: '打开一段会话时',
})

export const mediaPicture = definePart({
  name: 'media.picture',
  label: '消息里的图',
  summary: '消息里的一张缩略图',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '消息里有图时',
})

export const mediaFile = definePart({
  name: 'media.file',
  label: '消息里的文件',
  summary: '消息里的语音、PDF 等的一行',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '消息里有图以外的附件时',
})

export const mediaRead = definePart({
  name: 'media.read',
  label: '模型读的',
  summary: '模型读的是原件还是转写',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '知道模型读的是哪一份时',
})

export const mediaObject = definePart({
  name: 'media.object',
  label: '纸上的媒体',
  summary: '纸上的一张图、一个文件或一段语音',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '纸上摆着媒体时',
})

export const mediaIntake = definePart({
  name: 'media.intake',
  label: '拖到纸上的文件',
  summary: '拖到纸上的文件各传到了哪一步',
  within: 'canvas.view',
  depths: ['tokens', 'style'],
  when: '有文件拖到纸上时',
})

export const mediaParts = [
  mediaTray,
  mediaTrayChip,
  mediaTrayAttach,
  mediaTrayRecord,
  mediaTrayScreenshot,
  mediaPicture,
  mediaFile,
  mediaRead,
  mediaObject,
  mediaIntake,
] as const
