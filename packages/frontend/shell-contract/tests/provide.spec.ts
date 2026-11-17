import { describe, expect, it } from 'vitest'
import { serviceKey, serviceOf } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { render, startShell } from './reference-shell.ts'

type Port = Readonly<{ label: string; extra: number }>
type Need = Readonly<{ label: string }>

const portKey = serviceKey<Port>('test-port')

const host = defineUiModule({
  name: 'host-ui',
  inject: [],
  apply(_shell, _services, provide) {
    provide(portKey, { label: 'from the host', extra: 1 })
  },
})

function consumer(key: ReturnType<typeof serviceKey<Need>>, seen: string[]) {
  return defineUiModule({
    name: 'consumer-ui',
    inject: [key],
    apply(shell, services) {
      const port = serviceOf(services, key)
      seen.push(port.label)
      shell.contribute('pages', { id: 'consumer', title: port.label, order: 0, render })
    },
  })
}

describe('a UI module provides a service on the client tree', () => {
  it('a module that injects the key gets what the providing module gave', async () => {
    const { root, shell } = await startShell()
    const seen: string[] = []
    await root.plugin(consumer(portKey, seen))
    expect(seen).toEqual([])
    await root.plugin(host)
    expect(seen).toEqual(['from the host'])
    expect(shell.items('pages').map(item => item.title)).toEqual(['from the host'])
  })

  it('the service is gone once the providing module unloads', async () => {
    const { root } = await startShell()
    const provider = root.plugin(host)
    await provider
    const lookup = root as unknown as { get(name: string): unknown }
    expect(lookup.get(portKey)).toEqual({ label: 'from the host', extra: 1 })
    await provider.dispose()
    expect(lookup.get(portKey)).toBeUndefined()
  })

  it('a module that injects it unloads with what it placed, and loads again when it returns', async () => {
    const { root, shell } = await startShell()
    const seen: string[] = []
    await root.plugin(consumer(portKey, seen))
    const provider = root.plugin(host)
    await provider
    expect(shell.items('pages')).toHaveLength(1)
    await provider.dispose()
    expect(shell.items('pages')).toEqual([])
    await root.plugin(host)
    expect(shell.items('pages')).toHaveLength(1)
    expect(seen).toEqual(['from the host', 'from the host'])
  })

  it('a module that provides nothing is written as before, with two parameters', async () => {
    const { root, shell } = await startShell()
    await root.plugin(
      defineUiModule({
        name: 'plain',
        inject: [],
        apply(shell) {
          shell.contribute('pages', { id: 'plain', title: 'plain', order: 0, render })
        },
      }),
    )
    expect(shell.items('pages').map(item => item.id)).toEqual(['plain'])
  })
})
