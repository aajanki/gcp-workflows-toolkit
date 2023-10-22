import {
  WorkflowApp,
  MainWorkflow,
  Subworkflow,
  CallStep,
  toYAMLString,
  $,
} from '../dist/index.js'

function main() {
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

  const mainWorkflow = new MainWorkflow([
    new CallStep('call_subworkflow', {
      call: subworkflow,
      args: {
        name: 'Leela',
      },
    }),
  ])

  const workflow = new WorkflowApp(mainWorkflow, [subworkflow])

  console.log(toYAMLString(workflow))
}

main()
