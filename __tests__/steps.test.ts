import * as YAML from 'yaml'

import { $ } from '../src/variables'
import {
  assign,
  call,
  condition,
  end,
  raise,
  stepsStep,
  switchStep,
  tryExcept,
  returnStep,
  parallel,
  forStep,
  ForStep,
} from '../src/steps'
import { Subworkflow } from '../src/workflows'

describe('workflows step', () => {
  it('renders an assign step', () => {
    const { step } = assign('step1', [
      ['city', 'New New York'],
      ['value', $('1 + 2')],
    ])

    const expected = YAML.parse(`
    assign:
      - city: New New York
      - value: \${1 + 2}
    `)

    expect(step.render()).toEqual(expected)
  })

  it('assigns variables with index notation', () => {
    const { step } = assign('update_list', [
      ['my_list', [0, 1, 2, 3, 4]],
      ['idx', 0],
      ['my_list[0]', 'Value0'],
      ['my_list[idx + 1]', 'Value1'],
      ['my_list[len(my_list) - 1]', 'LastValue'],
    ])

    const expected = YAML.parse(`
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
    const { step } = call('step1', {
      call: 'destination_step',
    })

    const expected = YAML.parse(`
    call: destination_step
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a call step with arguments and result', () => {
    const { step } = call('step1', {
      call: 'deliver_package',
      args: {
        destination: 'Atlanta',
        deliveryCompany: 'Planet Express',
      },
      result: 'deliveryResult',
    })

    const expected = YAML.parse(`
    call: deliver_package
    args:
        destination: Atlanta
        deliveryCompany: Planet Express
    result: deliveryResult
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a call step with an expression as an argument', () => {
    const { step } = call('step1', {
      call: 'deliver_package',
      args: {
        destination: $('destinations[i]'),
      },
    })

    const expected = YAML.parse(`
    call: deliver_package
    args:
        destination: \${destinations[i]}
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a switch step', () => {
    const assign1 = assign('increase_counter', [['a', $('mars_counter + 1')]])
    const return1 = returnStep('return_counter', $('a'))
    const { step } = switchStep('step1', {
      conditions: [
        condition($('city = "New New York"'), {
          next: 'destination_new_new_york',
        }),
        condition($('city = "Mars Vegas"'), {
          steps: [assign1, return1],
        }),
      ],
      next: end,
    })

    const expected2 = YAML.parse(`
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
    const potentiallyFailingStep = call('http_step', {
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
    const { step } = tryExcept('step1', {
      steps: [potentiallyFailingStep],
      errorMap: 'e',
      exceptSteps: [knownErrors, unknownErrors],
    })

    const expected = YAML.parse(`
    try:
        steps:
          - http_step:
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

  it('renders a try step with a default retry policy', () => {
    const potentiallyFailingStep = call('http_step', {
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
    const { step } = tryExcept('step1', {
      steps: [potentiallyFailingStep],
      retryPolicy: 'http.default_retry',
      errorMap: 'e',
      exceptSteps: [knownErrors, unknownErrors],
    })

    const expected = YAML.parse(`
    try:
        steps:
          - http_step:
                call: http.get
                args:
                    url: https://maybe.failing.test/
                result: response
    retry: \${http.default_retry}
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

  it('renders a try step with a custom retry policy', () => {
    const potentiallyFailingStep = call('http_step', {
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
    const { step } = tryExcept('step1', {
      steps: [potentiallyFailingStep],
      retryPolicy: {
        predicate: 'http.default_retry',
        maxRetries: 10,
        backoff: {
          initialDelay: 0.5,
          maxDelay: 60,
          multiplier: 2,
        },
      },
      errorMap: 'e',
      exceptSteps: [knownErrors, unknownErrors],
    })

    const expected = YAML.parse(`
    try:
        steps:
          - http_step:
                call: http.get
                args:
                    url: https://maybe.failing.test/
                result: response
    retry:
        predicate: \${http.default_retry}
        max_retries: 10
        backoff:
            initial_delay: 0.5
            max_delay: 60
            multiplier: 2
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

  it('renders a try step with a subworkflow as a retry predicate', () => {
    const predicateSubworkflow = new Subworkflow(
      'my_retry_predicate',
      [returnStep('always_retry', true)],
      ['e']
    )

    const potentiallyFailingStep = call('http_step', {
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
    const { step } = tryExcept('step1', {
      steps: [potentiallyFailingStep],
      retryPolicy: {
        predicate: predicateSubworkflow,
        maxRetries: 3,
        backoff: {
          initialDelay: 2,
          maxDelay: 60,
          multiplier: 4,
        },
      },
      errorMap: 'e',
      exceptSteps: [knownErrors, unknownErrors],
    })

    const expected = YAML.parse(`
    try:
        steps:
          - http_step:
                call: http.get
                args:
                    url: https://maybe.failing.test/
                result: response
    retry:
        predicate: \${my_retry_predicate}
        max_retries: 3
        backoff:
            initial_delay: 2
            max_delay: 60
            multiplier: 4
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

  it('renders a for step', () => {
    const { step } = forStep('loop', {
      loopVariable: 'v',
      listExpression: [1, 2, 3],
      steps: [assign('addStep', [['sum', $('sum + v')]])],
    })

    const expected = YAML.parse(`
    for:
        value: v
        in: [1, 2, 3]
        steps:
          - addStep:
              assign:
                - sum: \${sum + v}
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders parallel branches', () => {
    const { step } = parallel('parallel1', {
      branches: [
        stepsStep('branch1', [
          call('say_hello_1', {
            call: 'sys.log',
            args: {
              text: 'Hello from branch 1',
            },
          }),
        ]),
        stepsStep('branch2', [
          call('say_hello_2', {
            call: 'sys.log',
            args: {
              text: 'Hello from branch 2',
            },
          }),
        ]),
      ],
    })

    const expected = YAML.parse(`
    parallel:
        branches:
          - branch1:
              steps:
                - say_hello_1:
                    call: sys.log
                    args:
                        text: Hello from branch 1
          - branch2:
              steps:
                - say_hello_2:
                    call: sys.log
                    args:
                        text: Hello from branch 2
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders parallel branches with shared variables and concurrency limit', () => {
    const { step } = parallel('parallel1', {
      branches: [
        stepsStep('branch1', [
          assign('assign_1', [['myVariable[0]', 'Set in branch 1']]),
        ]),
        stepsStep('branch2', [
          assign('assign_2', [['myVariable[1]', 'Set in branch 2']]),
        ]),
      ],
      shared: ['myVariable'],
      concurrencyLimit: 2,
    })

    const expected = YAML.parse(`
    parallel:
        shared: [myVariable]
        concurrency_limit: 2
        branches:
          - branch1:
              steps:
                - assign_1:
                    assign:
                      - myVariable[0]: 'Set in branch 1'
          - branch2:
              steps:
                - assign_2:
                    assign:
                      - myVariable[1]: 'Set in branch 2'
    `)

    expect(step.render()).toEqual(expected)
  })

  it('renders a parallel for step', () => {
    const { step } = parallel('parallelFor', {
      shared: ['total'],
      forLoop: new ForStep(
        [
          call('getBalance', {
            call: 'http.get',
            args: {
              url: $('"https://example.com/balance/" + userId'),
            },
            result: 'balance',
          }),
          assign('add', [['total', $('total + balance')]]),
        ],
        'userId',
        ['11', '12', '13', '14']
      ),
    })

    const expected = YAML.parse(`
    parallel:
        shared: [total]
        for:
            value: userId
            in: ['11', '12', '13', '14']
            steps:
              - getBalance:
                  call: http.get
                  args:
                      url: \${"https://example.com/balance/" + userId}
                  result: balance
              - add:
                  assign:
                    - total: \${total + balance}
    `)

    expect(step.render()).toEqual(expected)
  })
})
