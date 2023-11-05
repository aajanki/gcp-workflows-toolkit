import {
  WorkflowApp,
  MainWorkflow,
  Subworkflow,
  call,
  toYAMLString,
  $,
} from '../src/index'

function main() {
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

  const workflow = new WorkflowApp(mainWorkflow, [subworkflow])

  console.log(toYAMLString(workflow))
}

main()
