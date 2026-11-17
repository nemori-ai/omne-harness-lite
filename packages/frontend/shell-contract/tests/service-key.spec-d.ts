import { expectTypeOf, test } from 'vitest'
import { serviceKey, serviceOf, type ServiceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'

type Port = Readonly<{ label: string; extra: number }>
type Need = Readonly<{ label: string }>
type Other = Readonly<{ label: string; missing: boolean }>

const portKey = serviceKey<Port>('port')

test('a key whose shape gives more than the user needs can be passed where less is needed', () => {
  const needed: ServiceKey<Need> = portKey
  expectTypeOf(needed).toBeString()
})

test('a key whose shape lacks what the user needs does not compile', () => {
  // @ts-expect-error the port has no `missing`
  const wrong: ServiceKey<Other> = portKey
  expectTypeOf(wrong).toBeString()
})

test('a needed key cannot be widened back to the shape of the port', () => {
  const needed: ServiceKey<Need> = portKey
  // @ts-expect-error a key for less is not a key for more
  const back: ServiceKey<Port> = needed
  expectTypeOf(back).toBeString()
})

test('provide takes a value of the key shape, and serviceOf gives the key shape', () => {
  defineUiModule({
    name: 'typed',
    inject: [portKey],
    apply(_shell, services, provide) {
      provide(portKey, { label: 'x', extra: 1 })
      // @ts-expect-error the value lacks `extra`
      provide(portKey, { label: 'x' })
      expectTypeOf(serviceOf(services, portKey)).toEqualTypeOf<Port>()
    },
  })
})
