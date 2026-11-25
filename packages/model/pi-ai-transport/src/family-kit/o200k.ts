const O200K_RANKS_DIGEST = '6cf16f9e2292763021bb70ffed8e113a55f8d26f34110514c2518f47db1ea806'
const NO_SPECIAL_TOKENS_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
const JS_TIKTOKEN_INTEGRITY =
  'sha512-biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g=='

/** The o200k proxy that the OpenAI family adopts; every family that estimates with it names it. */
export const O200K_PROXY_TOKENIZER = {
  adoption: {
    owner: '@omne-harness/pi-ai-openai',
    name: 'o200k-proxy',
    revision: '1',
    digest: O200K_RANKS_DIGEST,
  },
  implementation: {
    owner: 'js-tiktoken',
    name: 'js-tiktoken',
    revision: '1.0.21',
    digest: JS_TIKTOKEN_INTEGRITY,
  },
  vocabulary: {
    owner: 'js-tiktoken',
    name: 'o200k_base',
    revision: '1.0.21',
    digest: O200K_RANKS_DIGEST,
  },
  configuration: {
    owner: '@omne-harness/pi-ai-openai',
    name: 'no-special-tokens',
    revision: '1',
    digest: NO_SPECIAL_TOKENS_DIGEST,
  },
} as const
