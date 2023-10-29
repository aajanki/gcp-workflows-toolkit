import * as YAML from 'yaml'

import {
  MainWorkflow,
  Subworkflow,
  WorkflowApp,
  toYAMLString,
} from '../src/workflows'
import {
  SwitchCondition,
  assign,
  call,
  returnStep,
  switchStep,
} from '../src/steps'
import { $ } from '../src/variables'

describe('workflow', () => {
  it('renders a main workflow', () => {
    const steps = [
      assign('assign_name', [['name', $('args.name')]]),
      call('say_hello', {
        call: 'sys.log',
        args: {
          text: $('"Hello, " + name'),
        },
      }),
    ]
    const wf = new MainWorkflow(steps, 'args')

    const expected = YAML.parse(`
    main:
        params: [args]
        steps:
          - assign_name:
              assign:
                - name: \${args.name}
          - say_hello:
              call: sys.log
              args:
                  text: \${"Hello, " + name}
    `)

    expect(wf.render()).toEqual(expected)
  })

  it('renders a subworkflow', () => {
    const steps = [
      call('log_greetings', {
        call: 'sys.log',
        args: {
          text: $('"Hello, " + name'),
        },
      }),
    ]
    const wf = new Subworkflow('say_hello', steps, ['name'])

    const expected = YAML.parse(`
    say_hello:
        params: [name]
        steps:
          - log_greetings:
              call: sys.log
              args:
                  text: \${"Hello, " + name}
    `)

    expect(wf.render()).toEqual(expected)
  })

  it('renders a full workflow', () => {
    const subworkflow = new Subworkflow(
      'say_hello',
      [
        call('log_greetings', {
          call: 'sys.log',
          args: {
            text: $('"Hello, " + name'),
          },
        }),
      ],
      ['name']
    )
    const mainWorkflow = new MainWorkflow([
      call('call_subworkflow', {
        call: subworkflow,
        args: {
          name: 'Leela',
        },
      }),
    ])
    const wf = new WorkflowApp(mainWorkflow, [subworkflow])

    const expected = YAML.parse(`
    main:
        steps:
          - call_subworkflow:
              call: say_hello
              args:
                  name: Leela
    say_hello:
        params: [name]
        steps:
          - log_greetings:
              call: sys.log
              args:
                  text: \${"Hello, " + name}
    `)

    expect(wf.render()).toEqual(expected)
  })

  it("doesn't allow duplicate subworkflow names", () => {
    const main = new MainWorkflow([assign('step1', [['a', '"a"']])])
    const sub1 = new Subworkflow('mysubworkflow', [returnStep('return1', '1')])
    const sub2 = new Subworkflow('anotherworkflow', [
      returnStep('return2', '2'),
    ])
    const sub3 = new Subworkflow('mysubworkflow', [returnStep('return3', '3')])

    expect(() => {
      new WorkflowApp(main, [sub1, sub2, sub3])
    }).toThrow()
  })

  it('outputs the workflow definition in YAML', () => {
    const steps = [
      assign('assign_name', [['name', $('args.name')]]),
      call('say_hello', {
        call: 'sys.log',
        args: {
          text: $('"Hello, " + name'),
        },
      }),
    ]
    const wf = new WorkflowApp(new MainWorkflow(steps, 'args'))

    const expected = YAML.parse(`
    main:
        params: [args]
        steps:
          - assign_name:
              assign:
                - name: \${args.name}
          - say_hello:
              call: sys.log
              args:
                  text: \${"Hello, " + name}
    `)

    expect(YAML.parse(toYAMLString(wf))).toEqual(expected)
  })
})

describe('Validator', () => {
  it('accepts a valid workflow', () => {
    const steps = [
      assign('assign_name', [['name', 'Fry']]),
      call('say_hello', {
        call: 'sys.log',
        args: {
          text: $('"Hello, " + name'),
        },
      }),
    ]
    const wf = new WorkflowApp(new MainWorkflow(steps))

    expect(() => wf.validate()).not.toThrow()
  })

  it('detects duplicate step names in the main workflow', () => {
    const steps = [
      assign('duplicated_name', [['name', 'Fry']]),
      call('duplicated_name', {
        call: 'sys.log',
        args: {
          text: $('"Hello, " + name'),
        },
      }),
    ]
    const wf = new WorkflowApp(new MainWorkflow(steps))

    expect(() => wf.validate()).toThrow()
  })

  it('detects duplicate step names in a subworkflow workflow', () => {
    const subworkflow = new Subworkflow(
      'say_hello',
      [
        call('duplicated_name', {
          call: 'sys.log',
          args: {
            text: $('"Hello, " + name'),
          },
        }),
        returnStep('duplicated_name', '1'),
      ],
      ['name']
    )
    const mainWorkflow = new MainWorkflow([
      call('call_subworkflow', {
        call: subworkflow,
        args: {
          name: 'Leela',
        },
      }),
    ])
    const wf = new WorkflowApp(mainWorkflow, [subworkflow])

    expect(() => wf.validate()).toThrow()
  })

  it('detects duplicate step names nested steps', () => {
    const steps = [
      assign('duplicated_name', [['name', 'Fry']]),
      switchStep('switch_step', {
        conditions: [
          new SwitchCondition($('name == "Fry"'), {
            steps: [
              assign('fry_quote', [
                ['quote', 'Space. It seems to go on forever.'],
              ]),
            ],
          }),
          new SwitchCondition($('name == "Zoidberg"'), {
            steps: [
              assign('duplicated_name', [
                ['quote', "Casual hello. It's me, Zoidberg. Act naturally."],
              ]),
            ],
          }),
          new SwitchCondition($('name == "Leela"'), {
            steps: [
              assign('leela_quote', [
                [
                  'quote',
                  "Look, I don't know about your previous captains, but I intend to do as little dying as possible.",
                ],
              ]),
            ],
          }),
        ],
      }),
      call('step2', {
        call: 'sys.log',
        args: {
          text: $('name + ": " + quote'),
        },
      }),
    ]
    const wf = new WorkflowApp(new MainWorkflow(steps))

    expect(() => wf.validate()).toThrow()
  })

  it('accepts the same steps name being used in the main and a subworkflow', () => {
    const subworkflow = new Subworkflow(
      'say_hello',
      [
        call('step1', {
          call: 'sys.log',
          args: {
            text: $('"Hello, " + name'),
          },
        }),
        returnStep('step2', '1'),
      ],
      ['name']
    )
    const mainWorkflow = new MainWorkflow([
      call('step1', {
        call: subworkflow,
        args: {
          name: 'Leela',
        },
      }),
    ])
    const wf = new WorkflowApp(mainWorkflow, [subworkflow])

    expect(() => wf.validate()).not.toThrow()
  })
})
