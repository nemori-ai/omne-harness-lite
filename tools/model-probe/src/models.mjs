// Confirmed delivery scope. Presence in a directory is not certification.
export const models = Object.freeze(
  [
    ...[
      'gpt-6-astra',
      'gpt-6-astra-pro',
      'gpt-6-sol',
      'gpt-6-sol-pro',
      'gpt-6-luna',
      'gpt-6-luna-pro',
      'gpt-5.6-sol',
      'gpt-5.6-sol-pro',
      'gpt-5.6-terra',
      'gpt-5.6-terra-pro',
      'gpt-5.6-luna',
      'gpt-5.6-luna-pro',
    ].map(name => ({ id: `openai/${name}`, family: 'openai', reminderRole: 'developer' })),
    ...['claude-opus-5.5', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5.1'].map(name => ({
      id: `anthropic/${name}`,
      family: 'anthropic',
      reminderRole: 'user',
    })),
    ...['deepseek-v4.1-flash', 'deepseek-v4-pro-0813'].map(name => ({
      id: `deepseek/${name}`,
      family: 'deepseek',
      reminderRole: 'user',
    })),
    ...['gemini-3.8-flash', 'gemini-3.7-flash'].map(name => ({
      id: `google/${name}`,
      family: 'google',
      reminderRole: 'user',
    })),
    ...['grok-4.7', 'grok-4.6'].map(name => ({
      id: `x-ai/${name}`,
      family: 'xai',
      reminderRole: 'user',
    })),
    ...[
      'qwen3.8-max-0902',
      'qwen3.8-max-prime',
      'qwen3.8-flash',
      'qwen3.8-2.4t-a95b',
      'qwen3.8-27b',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.7-flash',
    ].map(name => ({ id: `qwen/${name}`, family: 'qwen', reminderRole: 'user' })),
    ...['kimi-k3', 'kimi-k2.7-code'].map(name => ({
      id: `moonshotai/${name}`,
      family: 'moonshot',
      reminderRole: 'user',
    })),
    ...['glm-5.3', 'glm-5.3-prime', 'glm-5.3-flash', 'glm-5.3-flashx', 'glm-5.2'].map(name => ({
      id: `z-ai/${name}`,
      family: 'zai',
      reminderRole: 'user',
    })),
  ].map(Object.freeze),
)
