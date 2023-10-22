import { $, renderGWValue } from '../src/variables'

describe('variables', () => {
  it('renders null', () => {
    expect(null).toBe(null)
  })

  it('renders a number', () => {
    expect(renderGWValue(9)).toBe(9)
  })

  it('renders a string', () => {
    expect(renderGWValue('Good news, everyone!')).toBe('Good news, everyone!')
  })

  it('renders a list', () => {
    expect(renderGWValue([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('renders an expression', () => {
    expect(renderGWValue($('age + 6 > 18'))).toEqual('${age + 6 > 18}')
  })

  it('renders a complex object', () => {
    const gwvalue = {
      myboolean: true,
      mynestedobject: {
        numbers: [12, 34, 56],
        expression: $('5*(height + 2)'),
      },
      mynull: null,
    }
    expect(renderGWValue(gwvalue)).toEqual({
      myboolean: true,
      mynestedobject: {
        numbers: [12, 34, 56],
        expression: '${5*(height + 2)}',
      },
      mynull: null,
    })
  })
})
