export const figure =
  ({ React }) =>
  ({ subject }) =>
    React.createElement('div', {
      'data-e2e-skin': 'ember',
      style: { width: subject.size, height: subject.size },
    })
