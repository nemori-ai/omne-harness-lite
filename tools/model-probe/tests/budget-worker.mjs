import { openLedger } from '../src/budget.mjs'
const ledger = await openLedger(process.argv[2], { limitUsd: '100', researchLimitUsd: '50' })
const id = await ledger.reserve({
  model: 'synthetic',
  provider: 'controlled',
  stage: 'acceptance',
  estimateUsd: '1',
})
process.send({ phase: 'reserved', id })
process.on('message', async message => {
  if (message.phase === 'effect') {
    // The parent supplies only a controlled loopback fixture. This is not a paid request.
    const response = await fetch(message.url, { method: 'POST', body: id })
    await response.text()
    process.send({ phase: 'effect-confirmed', id })
  }
})
