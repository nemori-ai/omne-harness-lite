export const chip = ({ React }) => ({
  id: 'float-chip',
  order: 50,
  render: ({ grip }) =>
    React.createElement('div', { ...grip, 'data-omne-part': 'float-chip.card' }, '晴，二十度'),
})
