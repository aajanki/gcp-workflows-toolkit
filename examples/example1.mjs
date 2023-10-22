import {
  WorkflowApp,
  MainWorkflow,
  Subworkflow,
  CallStep,
  toYAMLString,
  $,
} from '../dist/index.js'

function main() {
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

  const workflow = new WorkflowApp(mainWorkflow, [subworkflow])

  console.log(toYAMLString(workflow))
}

main()
