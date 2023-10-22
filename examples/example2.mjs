import {
  WorkflowApp,
  MainWorkflow,
  Subworkflow,
  CallStep,
  SwitchStep,
  SwitchCondition,
  RaiseStep,
  TryStep,
  ReturnStep,
  toYAMLString,
  $,
} from '../dist/index.js'

function main() {
  const subworkflow = getOrderSubworkflow()
  const mainWorkflow = new MainWorkflow([
    new CallStep('call_subworkflow', {
      call: subworkflow,
      args: {
        order_id: '1234',
      },
      result: 'order_status',
    }),
    new CallStep('log_order', {
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
  const httpGetStep = new CallStep('get_order_status', {
    call: 'http.get',
    args: {
      url: $('"https://planet.express.test/orders/" + order_id'),
    },
    result: 'response',
  })

  const handleKnownErrors = new SwitchStep('known_errors', {
    conditions: [
      new SwitchCondition($('e.code == 404'), {
        steps: [new ReturnStep('return_error', 'Not found')],
      }),
    ],
  })

  const handleUnknownErrors = new RaiseStep('unknown_errors', $('e'))

  const step = new TryStep('try_get_order_status', {
    steps: [httpGetStep],
    errorMap: 'e',
    exceptSteps: [handleKnownErrors, handleUnknownErrors],
  })

  return new Subworkflow('get_order_status', [step], ['order_id'])
}

main()
