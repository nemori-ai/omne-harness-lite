import { describe, expect, it } from 'vitest'
import * as moved from '../src/derivation.ts'
import { fixtureLogin } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const TENANT = ALICE.tenantText
const SESSION = 'f'.repeat(64)

const ENTRY_TENANT_TEXT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'

const ENTRY: Readonly<
  Record<
    string,
    Readonly<{
      session: string
      input: string
      create: string
      accept: string
      control: string
      origin: string
    }>
  >
> = {
  'create-1': {
    session: '26f708ff2c01d6ced0b2e895c969e0c95a6ae77e031ab77fc1fe9ad5de122cb5',
    input: 'd1e94fea15160436dd979e1e4461de8f20a6477fecad78fb0731621becf4bc62',
    create: 'sop_3f7de511ab6381df465616df86cc3f56c33ec4d4e7e043b3efd05d0f7e4c58ca',
    accept: 'sop_3138eadbc355565ef04c09fb416ac100fee05b85e46b0988165a5fc2e772fe99',
    control: 'sop_abc1dfe09e8fe96e1bcb36fc6f6cd456989d43d12ce512e5434fdc9fa15c4b41',
    origin: '213b8afb0a821be374a694d2889806f824994d3226c6c4dce14513a778694488',
  },
  '': {
    session: '3e53c5579c209bb9ae0c859c70bb63f3bc705911edcd0424f7008036c933cdee',
    input: 'd0e37fdc4943bf9635973be1c4986ec7e00e2a6a14bc4f91911566548156446c',
    create: 'sop_4a28e318cbdf2c40da3297b1eeab2480057c26c08b49b31a664114721edc7809',
    accept: 'sop_a1aa4fab8be7f0733d9d9c90b000cfb3b1338c45e2b82106d05b43619bc4ae2b',
    control: 'sop_c886229b8f9673c38876e763bcf3dd783de1036b8248486d173ae3dc540c18dd',
    origin: '96ff1572d2ead63514be065ccbc96b494d48b55e3cd3c48dfc931d8716cdad19',
  },
  ['x'.repeat(200)]: {
    session: '285518685933ec0f863b45c1f193d69aae073306d0031f69098f503def2fa236',
    input: '25a9fe77daf66cb961c8b87e704813ac4307253241a72d5b2e8c9f96a3c305ea',
    create: 'sop_555d8b5ded99c8fd5fb41f2bd8923f4ba6deb6670363a9add9c16827fd9d61b3',
    accept: 'sop_67946fbe3f16a86693b267bf74ef52540405105a727d3953210d366b47aad41e',
    control: 'sop_05cdb8386857bc917db79c21e9de2d02028f88542ae01e3a1f3d1c6cc877e9c2',
    origin: '533979ddf065f3b875beaae192bbdd192e97d5640177c2a4e0c1867e19d568ce',
  },
  雪: {
    session: 'baea7dcd8ed008f95c0ad8adb645e9f2467d53038c87d362dab196cca120268f',
    input: '26e7761bc7cf0f6807c0ab0d6d6777fea3b411b44fc9280c9953333061cd7329',
    create: 'sop_ee726f3e874d5fee525790cb30b06c4d5332bf22540f948de2ceae13f2b96113',
    accept: 'sop_24967335e7106575bb25dc092ada64c8d597688082e77a8279ce10ef6669a412',
    control: 'sop_b1173b21991efc2b8564ffff9a544ddf31018049fc09ee7725b70da08b2e6fa2',
    origin: 'e6f6d96c9083e8661239602a01b78587041905137fda4be5e87b2c757d535581',
  },
}

describe('derived identities', () => {
  it('keep the identity family texts', () => {
    expect(moved.sessionIdentity(TENANT, 'create-1')).toMatch(/^[0-9a-f]{64}$/)
    expect(moved.sessionIdentity(TENANT, 'create-1')).not.toBe(
      moved.inputIdentity(TENANT, SESSION, 'create-1'),
    )
  })

  it.each(['create-1', '', 'x'.repeat(200), '雪'])(
    'equal what the server entry derived, byte for byte, for the id %j',
    id => {
      const entry = ENTRY[id]!
      expect(moved.tenantTextOf(ALICE.tenant)).toBe(ENTRY_TENANT_TEXT)
      expect(moved.sessionIdentity(TENANT, id)).toBe(entry.session)
      expect(moved.inputIdentity(TENANT, SESSION, id)).toBe(entry.input)
      expect(moved.createOperation(TENANT, id)).toBe(entry.create)
      expect(moved.acceptOperation(TENANT, SESSION, id)).toBe(entry.accept)
      expect(moved.controlOperation('login-1', TENANT, SESSION, id)).toBe(entry.control)
      expect(moved.loginEntryOrigin(ALICE.account.text, id)).toEqual({
        owner: 'login-entry',
        record: id,
        revision: '1',
        digest: entry.origin,
      })
    },
  )

  it('rejects an unminted tenant as the entry does', () => {
    expect(() => moved.tenantTextOf({} as never)).toThrow(TypeError)
  })
})
