const token = document.querySelector('meta[name="control-token"]').content
const cards = document.querySelector('#cards')
const status = document.querySelector('#status')
const result = document.querySelector('#result')
const form = document.querySelector('#create-form')
let items = [],
  next = null,
  filter = 'all',
  lastAction = null,
  lastOperation = null
let readSerial = 0
function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}
async function post(path, value) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workbench-Token': token },
    body: JSON.stringify(value),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data
}
function show(value) {
  result.textContent = JSON.stringify(value, null, 2)
}
function failure(error) {
  status.textContent = `本次操作未完成：${error.message}。可刷新状态或按原操作重试。`
}
async function act(action, input, repeat) {
  const envelope = repeat ?? { id: crypto.randomUUID(), action, input }
  lastAction = envelope
  document.querySelector('#retry').disabled = action === 'remount'
  const data = await post('/api/action', envelope)
  lastOperation = data.operation ?? null
  document.querySelector('#inspect').disabled = !lastOperation
  show(data)
  status.textContent =
    data.result.kind === 'unknown'
      ? '结果尚未确认。请查询原结果，或按原操作重试。'
      : `操作结果：${data.result.kind}`
  await refresh(false, true)
  return data
}
function button(label, handler, className) {
  const node = element('button', label, className)
  node.type = 'button'
  node.addEventListener('click', async () => {
    node.disabled = true
    try {
      await handler()
    } catch (error) {
      failure(error)
    } finally {
      node.disabled = false
    }
  })
  return node
}
const stateLabels = {
  waiting: '尚在等待答复',
  replied: '已有答复，仍需接手或等待其他卡片',
  accepted: '整批答复已接手，可以继续原工作',
  terminal: '原等待已结束',
}
function selected(item) {
  const card = item.card
  if (filter === 'all') return true
  if (filter === 'delivery') return card.kind === 'decided' && card.delivery.kind === 'pending'
  if (filter === 'accepted') return card.kind === 'decided' && card.delivery.kind === 'accepted'
  return card.kind === filter
}
function replyInput(item, reply) {
  return { cardRef: item.card.ref, expectedRevision: item.card.revision, reply }
}
async function render() {
  const fragment = document.createDocumentFragment()
  for (const item of items.filter(selected)) {
    const card = item.card,
      article = element('article', undefined, 'card')
    article.dataset.card = card.ref.cardId
    const top = element('div', undefined, 'card-top')
    top.append(element('h3', card.question.title))
    const label =
      card.kind === 'pending'
        ? '待答复'
        : card.kind === 'invalidated'
          ? '已取消'
          : card.delivery.kind === 'pending'
            ? '已答复 · 待接手'
            : card.delivery.kind === 'accepted'
              ? '已接手'
              : '已结束 · 已清理'
    top.append(element('span', label, `tag ${card.kind}`))
    article.append(top)
    article.append(element('p', card.question.description, 'description'))
    if (card.kind === 'pending') {
      const choices = element('div', undefined, 'choices')
      for (const option of card.question.options)
        choices.append(
          button(option.label, () =>
            act('reply', replyInput(item, { kind: 'selection', optionId: option.id })),
          ),
        )
      choices.append(button('不回答', () => act('reply', replyInput(item, { kind: 'decline' }))))
      article.append(choices)
      const raw = element('div', undefined, 'raw-reply'),
        label = element('label', '也可以直接写下原话')
      const text = element('textarea')
      text.rows = 2
      text.maxLength = 8192
      label.append(text)
      raw.append(label)
      raw.append(
        button('提交原话', () => {
          if (!text.value.length) throw new Error('请先填写原话')
          return act('reply', replyInput(item, { kind: 'text', text: text.value }))
        }),
      )
      article.append(raw)
    } else if (card.kind === 'decided') {
      const reply = card.decision.reply
      article.append(
        element(
          'div',
          reply.kind === 'text'
            ? reply.text
            : reply.kind === 'decline'
              ? '答复人选择不回答。'
              : `已选择：${card.question.options.find(o => o.id === reply.optionId)?.label ?? reply.optionId}`,
          'answer',
        ),
      )
    }
    const waitStatus = element('p', '点击“查看等待状态”读取原工作的当前状态。', 'wait')
    const controls = element('div', undefined, 'controls')
    controls.append(
      button('查看等待状态', async () => {
        const data = await post('/api/query', { query: 'wait', wait: item.origin.wait })
        show(data)
        waitStatus.textContent =
          data.result.kind === 'found'
            ? `${stateLabels[data.result.wait.state]} · 接收代次 ${data.result.wait.receiverGeneration}`
            : `等待状态：${data.result.kind}`
      }),
    )
    controls.append(
      button('接收答复', async () => {
        const data = await post('/api/query', { query: 'wait', wait: item.origin.wait })
        if (data.result.kind !== 'found') throw new Error(data.result.kind)
        await act('receive', {
          wait: item.origin.wait,
          expectedGeneration: data.result.wait.receiverGeneration,
        })
      }),
    )
    if (card.kind === 'pending')
      controls.append(button('结束此请求', () => act('cancel', { wait: item.origin.wait })))
    article.append(controls, waitStatus)
    fragment.append(article)
  }
  if (!fragment.childNodes.length)
    fragment.append(
      element(
        'div',
        items.length ? '此筛选下没有卡片。' : '还没有请求。从左侧创建一个，开始验证。',
        'empty',
      ),
    )
  cards.replaceChildren(fragment)
  document.querySelector('#summary').textContent =
    `当前已加载 ${items.length} 张卡片；待答复 ${items.filter(i => i.card.kind === 'pending').length} 张。`
  document.querySelector('#more').hidden = !next
}
async function refresh(more = false, keepStatus = false) {
  const serial = ++readSerial
  const data = await post('/api/query', {
    query: 'pool',
    ...(more && next ? { cursor: next } : {}),
  })
  if (serial !== readSerial) return
  document.querySelector('#assembly').textContent = `应用装配 #${data.revision}`
  if (data.result.kind !== 'page') {
    show(data)
    status.textContent =
      data.result.kind === 'conflict'
        ? '请求已有变化，请刷新以读取新的快照。'
        : `读取未完成：${data.result.kind}`
    return
  }
  items = more ? [...items, ...data.result.items] : data.result.items
  next = data.result.next
  if (!keepStatus)
    status.textContent =
      data.result.completeness === 'partial'
        ? '本页达到扫描预算，可继续加载。'
        : '已读取当前获准的请求。'
  await render()
}
form.addEventListener('submit', async event => {
  event.preventDefault()
  const submit = form.querySelector('[type=submit]')
  submit.disabled = true
  try {
    await act('create', {
      title: form.elements.title.value,
      description: form.elements.description.value,
      count: form.elements.batch.checked ? 2 : 1,
    })
  } catch (error) {
    failure(error)
  } finally {
    submit.disabled = false
  }
})
document.querySelector('#refresh').addEventListener('click', () => {
  void refresh().catch(failure)
})
document.querySelector('#more').addEventListener('click', () => {
  void refresh(true).catch(failure)
})
document.querySelector('#remount').addEventListener('click', () => {
  void act('remount', {}).catch(failure)
})
document.querySelector('#retry').addEventListener('click', () => {
  if (lastAction) void act(lastAction.action, lastAction.input, lastAction).catch(failure)
})
document.querySelector('#inspect').addEventListener('click', async () => {
  if (!lastOperation) return
  try {
    show(await post('/api/query', { query: 'operation', operation: lastOperation }))
  } catch (error) {
    failure(error)
  }
})
for (const node of document.querySelectorAll('[data-filter]'))
  node.addEventListener('click', () => {
    filter = node.dataset.filter
    for (const item of document.querySelectorAll('[data-filter]'))
      item.setAttribute('aria-pressed', String(item === node))
    void render()
  })
void refresh().catch(failure)
