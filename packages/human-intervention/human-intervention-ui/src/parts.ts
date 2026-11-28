import { definePart } from '@omne-harness/shell-contract'

export const humanInterventionPage = definePart({
  name: 'human-intervention.page',
  label: '待你决定页',
  summary: '等你回答或放行的卡',
  within: 'shell.workspace.page',
  depths: ['tokens', 'style'],
})

export const humanInterventionPageGroup = definePart({
  name: 'human-intervention.page.group',
  label: '一段会话的卡',
  summary: '同一段会话的卡放在一组',
  within: 'human-intervention.page',
  depths: ['tokens', 'style'],
  when: '有卡时',
})

export const humanInterventionSessionCards = definePart({
  name: 'human-intervention.session-cards',
  label: '会话里的卡',
  summary: '对话页里这段会话等你决定的卡',
  within: 'session.transcript',
  depths: ['tokens', 'style'],
  when: '这段会话有卡时',
})

export const humanInterventionPaper = definePart({
  name: 'human-intervention.paper',
  label: '一张纸',
  summary: '一组卡的一张纸，一次摆一张',
  depths: ['tokens', 'style'],
  when: '有卡时',
})

export const humanInterventionPaperPager = definePart({
  name: 'human-intervention.paper.pager',
  label: '翻题的圆点',
  summary: '纸顶一排圆点，每张卡一个，与上一题、下一题',
  within: 'human-intervention.paper',
  depths: ['tokens', 'style'],
  when: '纸上不止一张卡时',
})

export const humanInterventionPaperCard = definePart({
  name: 'human-intervention.paper.card',
  label: '一张卡',
  summary: '一个问题，或一次要放行的动作',
  within: 'human-intervention.paper',
  depths: ['tokens', 'style'],
  when: '有卡时',
})

export const humanInterventionPaperCardTitle = definePart({
  name: 'human-intervention.paper.card.title',
  label: '卡的标题',
  summary: '这张卡问的是什么',
  within: 'human-intervention.paper.card',
  depths: ['tokens', 'style'],
  when: '有卡时',
})

export const humanInterventionPaperCardDetail = definePart({
  name: 'human-intervention.paper.card.detail',
  label: '动作的详情',
  summary: '要放行的动作具体是什么',
  within: 'human-intervention.paper.card',
  depths: ['tokens', 'style'],
  when: '放行卡且工具给了详情时',
})

export const humanInterventionPaperCardAnswer = definePart({
  name: 'human-intervention.paper.card.answer',
  label: '作答的地方',
  summary: '选一项，或自己写',
  within: 'human-intervention.paper.card',
  depths: ['tokens', 'style'],
  when: '有卡时',
})

export const humanInterventionPaperFoot = definePart({
  name: 'human-intervention.paper.foot',
  label: '纸的底栏',
  summary: '一张纸一个，放提交',
  within: 'human-intervention.paper',
  depths: ['tokens', 'style'],
  when: '纸上有没答的卡时',
})

export const humanInterventionPaperFootSubmit = definePart({
  name: 'human-intervention.paper.foot.submit',
  label: '提交',
  summary: '把这张纸上的回答交上去',
  within: 'human-intervention.paper.foot',
  depths: ['tokens', 'style'],
  when: '选项不是画成按钮时',
})

export const humanInterventionPaperFootActions = definePart({
  name: 'human-intervention.paper.foot.actions',
  label: '底栏的按钮',
  summary: '提交与取消，或画成按钮的选项',
  within: 'human-intervention.paper.foot',
  depths: ['tokens', 'style'],
  when: '纸上有没答的卡时',
})

export const humanInterventionParts = [
  humanInterventionPage,
  humanInterventionPageGroup,
  humanInterventionSessionCards,
  humanInterventionPaper,
  humanInterventionPaperPager,
  humanInterventionPaperCard,
  humanInterventionPaperCardTitle,
  humanInterventionPaperCardDetail,
  humanInterventionPaperCardAnswer,
  humanInterventionPaperFoot,
  humanInterventionPaperFootActions,
  humanInterventionPaperFootSubmit,
] as const
