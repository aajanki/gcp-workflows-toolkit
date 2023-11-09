import { MainWorkflow, Subworkflow, WorkflowApp } from '../src/workflows'
import {
  assign,
  call,
  condition,
  returnStep,
  stepsStep,
  switchStep,
} from '../src/steps'
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

  it('can disable selected validators', () => {
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
    const disabled = ['duplicatedStepName']

    expect(() => validate(wf, disabled)).not.toThrow(WorkflowValidationError)
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
    expect(() => validate(wf)).toThrow('duplicatedStepName')
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

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('duplicatedStepName')
  })

  it('detects duplicate step names in nested steps', () => {
    const steps = [
      stepsStep('print_quotes', [
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
      ]),
    ]
    const wf = new WorkflowApp(new MainWorkflow(steps))

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('duplicatedStepName')
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
      [{ name: 'name' }]
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

  it("doesn't allow duplicate subworkflow names", () => {
    const main = new MainWorkflow([assign('step1', [['a', '"a"']])])
    const sub1 = new Subworkflow('mysubworkflow', [returnStep('return1', '1')])
    const sub2 = new Subworkflow('anotherworkflow', [
      returnStep('return2', '2'),
    ])
    const sub3 = new Subworkflow('mysubworkflow', [returnStep('return3', '3')])
    const wf = new WorkflowApp(main, [sub1, sub2, sub3])

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('duplicatedSubworkflowName')
  })

  it('detects a missing next target', () => {
    const sub1 = new Subworkflow('subworkflow1', [returnStep('return1', '1')])
    const sub2 = new Subworkflow('subworkflow2', [returnStep('return2', '2')])
    const step3 = call('step3', {
      call: 'sys.log',
      args: {
        text: 'Logging from step 3',
      },
    })
    const switch1 = switchStep('step1', {
      conditions: [
        condition($('input == 1'), {
          next: 'step3',
        }),
      ],
      next: 'missing_step',
    })
    const main = new MainWorkflow([switch1, step3], 'input')
    const wf = new WorkflowApp(main, [sub1, sub2])

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('missingJumpTarget')
  })

  it('detects a missing call target subworkflow', () => {
    const sub1 = new Subworkflow('subworkflow1', [returnStep('return1', '1')])
    const sub2 = new Subworkflow('subworkflow2', [returnStep('return2', '2')])
    const call1 = call('call1', { call: sub1 })
    const main = new MainWorkflow([call1], 'input')
    const wf = new WorkflowApp(main, [sub2])

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('missingJumpTarget')
  })

  it('detects if a required subworkflow argument is not provided', () => {
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', $('required_arg_1 + required_arg_2'))],
      [{ name: 'required_arg_1' }, { name: 'required_arg_2' }]
    )

    const main = new MainWorkflow([
      call('call1', {
        call: subworkflow,
        args: {
          required_arg_1: 1,
        },
      }),
    ])
    const wf = new WorkflowApp(main, [subworkflow])

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('wrongNumberOfCallArguments')
  })

  it('optional subworkflow parameters may be missing', () => {
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', $('required_arg_1 + optional_arg_2'))],
      [{ name: 'required_arg_1' }, { name: 'optional_arg_2', default: 2 }]
    )

    const main = new MainWorkflow([
      call('call1', {
        call: subworkflow,
        args: {
          required_arg_1: 1,
        },
      }),
    ])
    const wf = new WorkflowApp(main, [subworkflow])

    expect(() => validate(wf)).not.toThrow(WorkflowValidationError)
  })

  it('detects if a call step has too many arguments', () => {
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', $('required_arg_1 + required_arg_2'))],
      [{ name: 'required_arg_1' }, { name: 'required_arg_2' }]
    )

    const main = new MainWorkflow([
      call('step1', {
        call: subworkflow,
        args: {
          required_arg_1: 1,
          required_arg_2: 2,
          extra_argument: 'X',
        },
      }),
    ])
    const wf = new WorkflowApp(main, [subworkflow])

    expect(() => validate(wf)).toThrow(WorkflowValidationError)
    expect(() => validate(wf)).toThrow('wrongNumberOfCallArguments')
  })

  it('accepts a value for optional subworkflow parameters', () => {
    const subworkflow = new Subworkflow(
      'subworkflow1',
      [returnStep('return1', $('required_arg_1 + optional_arg_2'))],
      [{ name: 'required_arg_1' }, { name: 'optional_arg_2', default: 2 }]
    )

    const main = new MainWorkflow([
      call('step1', {
        call: subworkflow,
        args: {
          required_arg_1: 1,
          optional_arg_2: 2,
        },
      }),
    ])
    const wf = new WorkflowApp(main, [subworkflow])

    expect(() => validate(wf)).not.toThrow(WorkflowValidationError)
  })
})
