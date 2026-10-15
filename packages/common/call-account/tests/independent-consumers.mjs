import { admitRevision, judgeCallAccount, payableAmount } from '@omne-harness/call-account'

const produced = {
  subject: { kind: 'tool_execution', id: 'exec_01' },
  usage: [{ name: 'input', state: 'known', lexeme: '4', unit: 'token' }],
  cost: [{ state: 'unknown', unit: 'USD', source: 'supplier' }],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'provider-a',
  duration: { state: 'unknown' },
  receipt: 'received',
  revision: '0',
}

const admitted = judgeCallAccount(produced)
if (!('ok' in admitted)) throw new Error(admitted.rejected)

const later = judgeCallAccount({
  ...admitted.ok,
  receipt: 'late',
  revision: '1',
  cost: [{ state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' }],
})
if (!('ok' in later)) throw new Error(later.rejected)

const kept = admitRevision(admitted.ok, later.ok)
if (!('ok' in kept)) throw new Error(kept.rejected)
const payable = payableAmount(kept.ok)
if (!('ok' in payable) || payable.ok.state !== 'known') throw new Error('payable missing')

process.stdout.write(
  `${JSON.stringify({ producer: admitted.ok.subject.kind, payable: payable.ok })}\n`,
)
