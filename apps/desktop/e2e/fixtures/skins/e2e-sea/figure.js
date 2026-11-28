export const figure =
  ({ React }) =>
  ({ subject }) =>
    React.createElement('div', {
      'data-e2e-skin': 'sea',
      style: { width: subject.size, height: subject.size },
    })
