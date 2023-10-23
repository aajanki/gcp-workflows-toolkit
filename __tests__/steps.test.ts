import * as YAML from 'yaml'

import { $ } from '../src/variables'
import {
  assign,
  call,
  condition,
  end,
  raise,
  switchStep,
  tryExcept,
  returnStep,
} from '../src/steps'
import { Subworkflow } from '../src/workflows'

describe('workflows step', () => {
  it('renders an assign step', () => {
    const step = assign('step1', [
      ['city', 'New New York'],
      ['value', $('1 + 2')],
    ])

    const expected = YAML.parse(`
    step1:
        assign:
          - city: New New York
          - value: \${1 + 2}
    `)

    expect(step.render()).toEqual(expected)
  })

  it('assigns variables with index notation', () => {
    const step = assign('update_list', [
      ['my_list', [0, 1, 2, 3, 4]],
      ['idx', 0],
      ['my_list[0]', 'Value0'],
      ['my_list[idx + 1]', 'Value1'],
      ['my_list[len(my_list) - 1]', 'LastValue'],
    ])

    const expected = YAML.parse(`
    update_list:
        assign:
          - my_list: [0, 1, 2, 3, 4]
          - idx: 0
          - my_list[0]: "Value0"
          - my_list[idx + 1]: "Value1"
          - my_list[len(my_list) - 1]: "LastValue"
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a simple call step', () => {
    const step = call('step1', {
      call: 'destination_step',
    })

    const expected = YAML.parse(`
    step1:
        call: destination_step
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a call step with arguments and result', () => {
    const step = call('step1', {
      call: 'deliver_package',
      args: {
        destination: 'Atlanta',
        deliveryCompany: 'Planet Express',
      },
      result: 'deliveryResult',
    })

    const expected = YAML.parse(`
    step1:
        call: deliver_package
        args:
            destination: Atlanta
            deliveryCompany: Planet Express
        result: deliveryResult
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a call step with an expression as an argument', () => {
    const step = call('step1', {
      call: 'deliver_package',
      args: {
        destination: $('destinations[i]'),
      },
    })

    const expected = YAML.parse(`
    step1:
        call: deliver_package
        args:
            destination: \${destinations[i]}
    `)

    expect(step.render()).toEqual(expected)
  })

  it('throws if a required call argument is not provided', () => {
    const requiredParams = ['arg1', 'arg2']
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', '1')],
      requiredParams
    )

    expect(() => {
      call('step1', {
        call: subworkflow,
        args: {
          arg1: 'value1',
        },
      })
    }).toThrow('Required parameter not provided')
  })

  it('throws if call step has too many arguments', () => {
    const requiredParams = ['arg1', 'arg2']
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', '1')],
      requiredParams
    )

    expect(() => {
      call('step1', {
        call: subworkflow,
        args: {
          arg1: 'value1',
          arg2: 'value2',
          extra_argument: '',
        },
      })
    }).toThrow('Extra arguments provided')
  })

  it('renders a switch step', () => {
    const destination1 = call('destination_new_new_york', {
      call: 'deliver_to_new_new_york',
    })
    const assign1 = assign('increase_counter', [['a', $('mars_counter + 1')]])
    const return1 = returnStep('return_counter', $('a'))
    const step = switchStep('step1', {
      conditions: [
        condition($('city = "New New York"'), {
          next: destination1,
        }),
        condition($('city = "Mars Vegas"'), {
          steps: [assign1, return1],
        }),
      ],
      next: end(),
    })

    const expected2 = YAML.parse(`
    step1:
        switch:
            - condition: \${city = "New New York"}
              next: destination_new_new_york
            - condition: \${city = "Mars Vegas"}
              steps:
                - increase_counter:
                    assign:
                      - a: \${mars_counter + 1}
                - return_counter:
                    return: \${a}
        next: end
    `)

    expect(step.render()).toEqual(expected2)
  })

  it('renders a try step', () => {
    const potentiallyFailingStep = call('step2', {
      call: 'http.get',
      args: {
        url: 'https://maybe.failing.test/',
      },
      result: 'response',
    })
    const knownErrors = switchStep('known_errors', {
      conditions: [
        condition($('e.code == 404'), {
          steps: [returnStep('return_error', 'Not found')],
        }),
      ],
    })
    const unknownErrors = raise('unknown_errors', $('e'))
    const step = tryExcept('step1', {
      steps: [potentiallyFailingStep],
      errorMap: 'e',
      exceptSteps: [knownErrors, unknownErrors],
    })

    const expected = YAML.parse(`
    step1:
        try:
            steps:
              - step2:
                    call: http.get
                    args:
                        url: https://maybe.failing.test/
                    result: response
        except:
            as: e
            steps:
              - known_errors:
                  switch:
                      - condition: \${e.code == 404}
                        steps:
                          - return_error:
                              return: "Not found"
              - unknown_errors:
                  raise: \${e}
    `)

    expect(step.render()).toEqual(expected)
  })
})
