const text = { kind: 'text' }

const FORECASTS = { Paris: 'sunny, 18 °C', Oslo: 'snow, -3 °C' }

export function protocol() {
  return {
    contract: {
      name: 'weather',
      major: 1,
      operations: {
        forecast: {
          effect: 'read',
          limit: 'small',
          body: { kind: 'object', fields: { city: { rule: text } } },
          result: text,
        },
      },
    },
    handlers: {
      async forecast(input) {
        return {
          outcome: 'succeeded',
          body: FORECASTS[input.city] ?? `no forecast for ${input.city}`,
        }
      },
    },
  }
}
