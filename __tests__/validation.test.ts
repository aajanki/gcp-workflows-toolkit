import { MainWorkflow, Subworkflow, WorkflowApp } from '../src/workflows'
import { assign, call, condition, returnStep, switchStep } from '../src/steps'
import { WorkflowValidationError, validate } from '../src/validation'
import { $ } from '../src/variables'

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

    expect(() => validate(wf)).not.toThrow()
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

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
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

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
  })

  it('detects duplicate step names nested steps', () => {
    const steps = [
      assign('duplicated_name', [['name', 'Fry']]),
      switchStep('switch_step', {
        conditions: [
          condition($('name == "Fry"'), {
            steps: [
              assign('fry_quote', [
                ['quote', 'Space. It seems to go on forever.'],
              ]),
            ],
          }),
          condition($('name == "Zoidberg"'), {
            steps: [
              assign('duplicated_name', [
                ['quote', "Casual hello. It's me, Zoidberg. Act naturally."],
              ]),
            ],
          }),
          condition($('name == "Leela"'), {
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

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
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

    expect(() => validate(wf)).not.toThrow()
  })
})
