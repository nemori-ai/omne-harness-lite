import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { openRealApp, TENANT_A } from './real-provider.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('missing test root')
const app = await openRealApp({ root })
succeeded(await app.create(TENANT_A), 'create')
const access = app.access(TENANT_A)
const added = succeeded(
  await app.port.commit({
    access,
    command: {
      kind: 'addTodo',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId('crash-add'),
        text: 'survives process death',
      },
    },
    guards: [],
  }),
  'add',
)
for (const kind of ['markTodoComplete', 'removeTodo'] as const)
  succeeded(
    await app.port.commit({
      access,
      command: {
        kind,
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId(kind === 'markTodoComplete' ? 'crash-complete' : 'crash-remove'),
          item: added.item.id,
        },
      },
      guards: [],
    }),
    kind,
  )
process.stdout.write('READY\n')
setInterval(() => undefined, 1000)
