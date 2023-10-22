import * as YAML from 'yaml'

import {
  MainWorkflow,
  Subworkflow,
  WorkflowApp,
  toYAMLString,
} from '../src/workflows'
import { AssignStep, CallStep, ReturnStep } from '../src/steps'
import { $ } from '../src/variables'

describe('workflow', () => {
  it('renders a main workflow', () => {
    const steps = [
      new AssignStep('assign_name', [['name', $('args.name')]]),
      new CallStep('say_hello', {
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
      new CallStep('log_greetings', {
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
    const mainWorkflow = new MainWorkflow([
      new CallStep('call_subworkflow', {
        call: 'say_hello',
        args: {
          name: 'Leela',
        },
      }),
    ])
    const subworkflow = new Subworkflow(
      'say_hello',
      [
        new CallStep('log_greetings', {
          call: 'sys.log',
          args: {
            text: $('"Hello, " + name'),
          },
        }),
      ],
      ['name']
    )
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
    const main = new MainWorkflow([new AssignStep('step1', [['a', '"a"']])])
    const sub1 = new Subworkflow('mysubworkflow', [
      new ReturnStep('return1', '1'),
    ])
    const sub2 = new Subworkflow('anotherworkflow', [
      new ReturnStep('return2', '2'),
    ])
    const sub3 = new Subworkflow('mysubworkflow', [
      new ReturnStep('return3', '3'),
    ])

    expect(() => {
      new WorkflowApp(main, [sub1, sub2, sub3])
    }).toThrow()
  })

  it('outputs the workflow defition in YAML', () => {
    const steps = [
      new AssignStep('assign_name', [['name', $('args.name')]]),
      new CallStep('say_hello', {
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
