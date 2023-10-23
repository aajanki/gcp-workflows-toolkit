import {
  WorkflowApp,
  MainWorkflow,
  Subworkflow,
  call,
  condition,
  raise,
  returnStep,
  switchStep,
  toYAMLString,
  tryExcept,
  $,
} from '../dist/index.js'

function main() {
  const subworkflow = getOrderSubworkflow()
  const mainWorkflow = new MainWorkflow([
    call('call_subworkflow', {
      call: subworkflow,
      args: {
        order_id: '1234',
      },
      result: 'order_status',
    }),
    call('log_order', {
      call: 'sys.log',
      args: {
        text: $('order_status'),
      },
    }),
  ])

  const workflow = new WorkflowApp(mainWorkflow, [subworkflow])

  console.log(toYAMLString(workflow))
}

function getOrderSubworkflow() {
  const httpGetStep = call('get_order_status', {
    call: 'http.get',
    args: {
      url: $('"https://planet.express.test/orders/" + order_id'),
    },
    result: 'response',
  })

  const handleKnownErrors = switchStep('known_errors', {
    conditions: [
      condition($('e.code == 404'), {
        steps: [returnStep('return_error', 'Not found')],
      }),
    ],
  })

  const handleUnknownErrors = raise('unknown_errors', $('e'))

  const step = tryExcept('try_get_order_status', {
    steps: [httpGetStep],
    errorMap: 'e',
    exceptSteps: [handleKnownErrors, handleUnknownErrors],
  })

  return new Subworkflow('get_order_status', [step], ['order_id'])
}

main()
