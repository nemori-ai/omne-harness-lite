// 替身守卫：代表原工作拥有者的事务内守卫。facts.verdict 为 live 时参与，否则以 conflict 停止整笔提交。
export default {
  participant: 'fixture.hitl.guard',
  protocol: 'fixture-hitl-guard/1',
  execute(facts) {
    return facts.verdict === 'live'
      ? { kind: 'participated', response: facts }
      : { kind: 'conflict', basis: { reason: 'fixture-work-ended' } }
  },
}
