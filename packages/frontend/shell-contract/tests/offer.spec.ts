import { ask } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { attachWhile, needPoint, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { render, startShell } from './reference-shell.ts'

type Port = Readonly<{ label: string; extra: number }>
type Wanted = Readonly<{ label: string }>

const portKey = serviceKey<Port>('host.port')

const host = (label = 'from the host') =>
  defineUiModule({
    name: 'host-ui',
    needs: {},
    apply(_shell, _bound, provide) {
      provide(portKey, { label, extra: 1 })
    },
  })

const settled = async () => {
  for (let round = 0; round < 8; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('what a view module provides is one item on a point of its own', () => {
  it('declares the point by the name of the key and puts the item on it; both go with the module', async () => {
    const { root, shell } = await startShell()
    const provider = root.plugin(host())
    await provider
    await settled()
    const there = () => ask<Port>(shell.registry(), portKey, '', [])
    expect(there()).toMatchObject({ kind: 'one', entry: { item: { label: 'from the host' } } })
    await provider.dispose()
    await settled()
    expect(there().kind).not.toBe('one')
  })

  it('a module that needs it is adopted while it is there, and applies again when it is back', async () => {
    const { root, shell } = await startShell()
    const seen: string[] = []
    await root.plugin(
      defineUiModule({
        name: 'consumer-ui',
        needs: { port: needPoint<Wanted>(portKey) },
        apply(inner, { port }) {
          const given = port.get()
          seen.push(given?.label ?? 'nothing')
          if (given === undefined) return
          inner.contribute('sidebar', { id: 'consumer', order: 0, render })
        },
      }),
    )
    await settled()
    expect(seen).toEqual(['nothing'])
    expect(shell.adoption('consumer-ui')).toMatchObject({ kind: 'unavailable' })
    const provider = root.plugin(host())
    await provider
    await settled()
    expect(seen).toEqual(['nothing', 'from the host'])
    expect(shell.items('sidebar')).toHaveLength(1)
    await provider.dispose()
    await settled()
    expect(shell.items('sidebar')).toEqual([])
    await root.plugin(host('again'))
    await settled()
    expect(seen.at(-1)).toBe('again')
  })
})

describe('an optional need for what another module provides', () => {
  it('is empty while nobody declared the point, follows what is put, and never applies the module again', async () => {
    const { root, shell } = await startShell()
    const applied: string[] = []
    const attached: string[] = []
    await root.plugin(
      defineUiModule({
        name: 'consumer-ui',
        needs: { port: needPoint<Wanted>(portKey, { optional: true }) },
        apply(_shell, { port }) {
          applied.push(port.get()?.label ?? 'nothing')
          return attachWhile(port, given => {
            attached.push(`on ${given.label}`)
            return () => void attached.push(`off ${given.label}`)
          })
        },
      }),
    )
    await settled()
    expect(shell.adoption('consumer-ui')).toEqual({ kind: 'adopted', bindings: { port: null } })
    expect(applied).toEqual(['nothing'])
    const provider = root.plugin(host())
    await provider
    await settled()
    expect(attached).toEqual(['on from the host'])
    await provider.dispose()
    await settled()
    expect(attached).toEqual(['on from the host', 'off from the host'])
    await root.plugin(host('again'))
    await settled()
    expect(attached.at(-1)).toBe('on again')
    expect(applied).toEqual(['nothing'])
  })

  it('takes off what it attached when the module goes', async () => {
    const { root } = await startShell()
    const attached: string[] = []
    await root.plugin(host())
    const consumer = root.plugin(
      defineUiModule({
        name: 'consumer-ui',
        needs: { port: needPoint<Wanted>(portKey, { optional: true }) },
        apply: (_shell, { port }) =>
          attachWhile(port, given => {
            attached.push(`on ${given.label}`)
            return () => void attached.push(`off ${given.label}`)
          }),
      }),
    )
    await consumer
    await settled()
    await consumer.dispose()
    await settled()
    expect(attached).toEqual(['on from the host', 'off from the host'])
  })
})
