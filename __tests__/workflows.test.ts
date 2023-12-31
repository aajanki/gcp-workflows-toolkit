import * as YAML from 'yaml'

import {
  MainWorkflow,
  Subworkflow,
  WorkflowApp,
  toYAMLString,
} from '../src/workflows'
import { assign, call } from '../src/steps'
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
          text: $('greeting + ", " + name'),
        },
      }),
    ]
    const wf = new Subworkflow('say_hello', steps, [
      { name: 'name' },
      { name: 'greeting', default: 'Hello' },
    ])

    const expected = YAML.parse(`
    say_hello:
        params: [name, greeting: 'Hello']
        steps:
          - log_greetings:
              call: sys.log
              args:
                  text: \${greeting + ", " + name}
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
      [{ name: 'name' }]
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
