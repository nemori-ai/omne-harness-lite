# @omne-harness/legal-identity 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AccountId`

```ts
type AccountId = AtomicIdentity<'AccountId'>;
```

### `IDENTITY_TYPE_NAMES`

```ts
const IDENTITY_TYPE_NAMES: readonly ("AccountId" | "LoginStateId" | "OrganizationId" | "ScopeLayerIdentity" | "TenantId")[];
```

### `IdentityTextCodec`

```ts
interface IdentityTextCodec<T> {
    readonly parse: (text: string) => IdentityTextResult<T>;
    readonly encode: (value: T) => IdentityTextResult<string>;
}
```

### `IdentityTextError`

```ts
interface IdentityTextError {
    readonly kind: 'identity-text-error';
    readonly code: 'type' | 'lexicon' | 'whitespace' | 'case' | 'extra-member' | 'missing-member' | 'family';
}
```

### `IdentityTextResult`

```ts
type IdentityTextResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: IdentityTextError;
};
```

### `LoginStateId`

```ts
type LoginStateId = AtomicIdentity<'LoginStateId'>;
```

### `OrganizationId`

```ts
type OrganizationId = AtomicIdentity<'OrganizationId'>;
```

### `ScopeLayerIdentity`

```ts
type ScopeLayerIdentity = {
    readonly name: 'ScopeLayerIdentity';
    readonly layer: 'organization';
    readonly organization: OrganizationId;
} | {
    readonly name: 'ScopeLayerIdentity';
    readonly layer: 'tenant';
    readonly tenant: TenantId;
};
```

### `TenantId`

```ts
interface TenantId {
    readonly name: 'TenantId';
    readonly organization: OrganizationId;
    readonly account: AccountId;
}
```

### `accountCodec`

```ts
const accountCodec: IdentityTextCodec<AccountId>;
```

### `accountEquals`

```ts
function accountEquals(left: AccountId, right: AccountId): boolean;
```

### `loginStateCodec`

```ts
const loginStateCodec: IdentityTextCodec<LoginStateId>;
```

### `loginStateEquals`

```ts
function loginStateEquals(left: LoginStateId, right: LoginStateId): boolean;
```

### `organizationCodec`

```ts
const organizationCodec: IdentityTextCodec<OrganizationId>;
```

### `organizationEquals`

```ts
function organizationEquals(left: OrganizationId, right: OrganizationId): boolean;
```

### `scopeLayerCodec`

```ts
const scopeLayerCodec: IdentityTextCodec<ScopeLayerIdentity>;
```

### `scopeLayerEquals`

```ts
function scopeLayerEquals(left: ScopeLayerIdentity, right: ScopeLayerIdentity): boolean;
```

### `tenant`

```ts
function tenant(organization: OrganizationId, account: AccountId): TenantId;
```

### `tenantCodec`

```ts
const tenantCodec: IdentityTextCodec<TenantId>;
```

### `tenantEquals`

```ts
function tenantEquals(left: TenantId, right: TenantId): boolean;
```

## 内部引用

### `AtomicIdentity`

```ts
interface AtomicIdentity<N extends AtomicName> {
    readonly name: N;
    readonly text: string;
}
```

### `AtomicName`

```ts
type AtomicName = AtomicSpec['name'];
```

### `AtomicSpec`

```ts
type AtomicSpec = Extract<IdentitySpec, {
    readonly prefix: string;
}>;
```

### `IDENTITY_SPECS`

```ts
const IDENTITY_SPECS: readonly [
    {
        readonly name: 'AccountId';
        readonly prefix: 'acc_';
    },
    {
        readonly name: 'OrganizationId';
        readonly prefix: 'org_';
    },
    {
        readonly name: 'LoginStateId';
        readonly prefix: 'lgn_';
    },
    {
        readonly name: 'TenantId';
    },
    {
        readonly name: 'ScopeLayerIdentity';
    }
];
```

### `IdentitySpec`

```ts
type IdentitySpec = (typeof IDENTITY_SPECS)[number];
```
