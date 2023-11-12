import type { GWValue, GWVariableName } from './variables'
import { GWExpression, renderGWValue } from './variables'
import { Subworkflow } from './workflows'

export type GWStepName = string
export type GWAssignment = readonly [GWVariableName, GWValue]
export type GWArguments = Record<GWVariableName, GWValue>

export interface WorkflowStep {
  render(): object
  nestedSteps(): NamedWorkflowStep[]
}

export type NamedWorkflowStep = { name: GWStepName; step: WorkflowStep }

export const end = 'end'

// https://cloud.google.com/workflows/docs/reference/syntax/variables#assign-step
export class AssignStep implements WorkflowStep {
  readonly assignments: Array<GWAssignment>

  constructor(assignments: Array<GWAssignment>) {
    this.assignments = assignments
  }

  render(): object {
    return {
      assign: this.assignments.map(([key, val]) => {
        return { [key]: renderGWValue(val) }
      }),
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return []
  }
}

export function assign(
  name: GWStepName,
  assignments: Array<GWAssignment>
): NamedWorkflowStep {
  return { name, step: new AssignStep(assignments) }
}

// https://cloud.google.com/workflows/docs/reference/syntax/calls
export class CallStep implements WorkflowStep {
  readonly call: string
  readonly args?: GWArguments
  readonly result?: string

  constructor(call: string, args?: GWArguments, result?: string) {
    this.call = call
    this.args = args
    this.result = result
  }

  render(): object {
    let renderedArgs:
      | Record<string, null | string | number | boolean | object>
      | undefined = undefined
    if (this.args) {
      renderedArgs = Object.fromEntries(
        Object.entries(this.args).map(([k, v]) => {
          return [k, renderGWValue(v)]
        })
      )
    }

    return {
      call: this.call,
      args: renderedArgs,
      result: this.result,
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return []
  }
}

export function call(
  name: GWStepName,
  options: { call: string | Subworkflow; args?: GWArguments; result?: string }
): NamedWorkflowStep {
  const callTarget = options.call instanceof Subworkflow ? options.call.name : options.call
  return {
    name,
    step: new CallStep(callTarget, options.args, options.result),
  }
}

// A class representing the individual branches of a switch step
export class SwitchCondition {
  readonly condition: GWExpression
  readonly next?: GWStepName
  readonly steps: NamedWorkflowStep[]

  constructor(
    condition: GWExpression,
    options: { next: GWStepName } | { steps: NamedWorkflowStep[] }
  ) {
    this.condition = condition

    if ('next' in options) {
      this.next = options.next
      this.steps = []
    } else {
      this.next = undefined
      this.steps = options.steps
    }
  }

  render(): object {
    return {
      condition: this.condition.render(),
      next: this.next,
      steps: this.steps.length > 0 ? renderSteps(this.steps) : undefined,
    }
  }
}

export function condition(
  expression: GWExpression,
  options: { next: GWStepName } | { steps: NamedWorkflowStep[] }
) {
  return new SwitchCondition(expression, options)
}

// https://cloud.google.com/workflows/docs/reference/syntax/conditions
export class SwitchStep implements WorkflowStep {
  readonly conditions: SwitchCondition[]
  readonly next?: GWStepName

  constructor(conditions: SwitchCondition[], next?: GWStepName) {
    this.conditions = conditions
    this.next = next
  }

  render(): object {
    return {
      switch: this.conditions.map((cond) => cond.render()),
      next: this.next,
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return this.conditions.flatMap((x) => x.steps)
  }
}

export function switchStep(
  name: GWStepName,
  options: { conditions: SwitchCondition[]; next?: GWStepName }
): NamedWorkflowStep {
  return { name, step: new SwitchStep(options.conditions, options.next) }
}

export type DefaultRetryPolicy =
  | 'http.default_retry'
  | 'http.default_retry_non_idempotent'
export interface CustomRetryPolicy {
  predicate: DefaultRetryPolicy | Subworkflow
  maxRetries: number
  backoff: {
    initialDelay: number
    maxDelay: number
    multiplier: number
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/catching-errors
export class TryExceptStep implements WorkflowStep {
  readonly retryPolicy?: string | CustomRetryPolicy
  readonly errorMap?: GWStepName
  // Steps in the try block
  readonly trySteps: NamedWorkflowStep[]
  // Steps in the except block
  readonly exceptSteps: NamedWorkflowStep[]

  constructor(
    steps: NamedWorkflowStep[],
    exceptSteps: NamedWorkflowStep[],
    retryPolicy?: DefaultRetryPolicy | CustomRetryPolicy,
    errorMap?: GWVariableName
  ) {
    this.trySteps = steps
    this.retryPolicy = retryPolicy
    this.errorMap = errorMap
    this.exceptSteps = exceptSteps
  }

  render(): object {
    let retry
    if (typeof this.retryPolicy === 'undefined') {
      retry = undefined
    } else if (typeof this.retryPolicy === 'string') {
      retry = `\${${this.retryPolicy}}`
    } else {
      const predicateName =
        typeof this.retryPolicy.predicate === 'string'
          ? this.retryPolicy.predicate
          : this.retryPolicy.predicate.name
      retry = {
        predicate: `\${${predicateName}}`,
        max_retries: this.retryPolicy.maxRetries,
        backoff: {
          initial_delay: this.retryPolicy.backoff.initialDelay,
          max_delay: this.retryPolicy.backoff.maxDelay,
          multiplier: this.retryPolicy.backoff.multiplier,
        },
      }
    }

    return {
      try: {
        steps: renderSteps(this.trySteps),
      },
      retry: retry,
      except: {
        as: this.errorMap,
        steps: renderSteps(this.exceptSteps),
      },
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return this.trySteps.concat(this.exceptSteps)
  }
}

export function tryExcept(
  name: GWStepName,
  options: {
    steps: NamedWorkflowStep[]
    retryPolicy?: DefaultRetryPolicy | CustomRetryPolicy
    errorMap?: GWVariableName
    exceptSteps: NamedWorkflowStep[]
  }
): NamedWorkflowStep {
  return {
    name,
    step: new TryExceptStep(
      options.steps,
      options.exceptSteps,
      options.retryPolicy,
      options.errorMap
    ),
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/raising-errors
export class RaiseStep implements WorkflowStep {
  readonly value: GWValue

  constructor(value: GWValue) {
    this.value = value
  }

  render(): object {
    return {
      raise: renderGWValue(this.value),
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return []
  }
}

export function raise(name: GWStepName, value: GWValue): NamedWorkflowStep {
  return { name, step: new RaiseStep(value) }
}

// https://cloud.google.com/workflows/docs/reference/syntax/iteration
export class ForStep implements WorkflowStep {
  readonly steps: NamedWorkflowStep[]
  readonly loopVariableName: GWVariableName
  readonly indexVariableName?: GWVariableName
  readonly listExpression?: GWExpression | GWValue[]
  readonly rangeStart?: number
  readonly rangeEnd?: number

  constructor(
    steps: NamedWorkflowStep[],
    loopVariable: GWVariableName,
    listExpression?: GWExpression | GWValue[],
    indexVariable?: GWVariableName,
    rangeStart?: number,
    rangeEnd?: number
  ) {
    this.steps = steps
    this.loopVariableName = loopVariable
    this.indexVariableName = indexVariable
    this.listExpression = listExpression
    this.rangeStart = rangeStart
    this.rangeEnd = rangeEnd
  }

  render(): object {
    return {
      for: this.renderBody(),
    }
  }

  renderBody(): object {
    let range
    let inValue
    if (typeof this.listExpression === 'undefined') {
      range = [this.rangeStart, this.rangeEnd]
      inValue = undefined
    } else {
      inValue = renderGWValue(this.listExpression)
      range = undefined
    }

    return {
      value: this.loopVariableName,
      index: this.indexVariableName,
      in: inValue,
      range: range,
      steps: renderSteps(this.steps),
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return this.steps
  }
}

export function forStep(
  name: GWStepName,
  options:
    | {
        steps: NamedWorkflowStep[]
        loopVariable: GWVariableName
        indexVariable?: GWVariableName
        listExpression: GWExpression | GWValue[]
      }
    | {
        steps: NamedWorkflowStep[]
        loopVariable: GWVariableName
        start: number
        end: number
      }
): NamedWorkflowStep {
  let step: ForStep
  if ('listExpression' in options) {
    step = new ForStep(
      options.steps,
      options.loopVariable,
      options.listExpression,
      options.indexVariable,
      undefined,
      undefined
    )
  } else {
    step = new ForStep(
      options.steps,
      options.loopVariable,
      undefined,
      undefined,
      options.start,
      options.end
    )
  }

  return {
    name,
    step,
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/steps#embedded-steps
export class StepsStep implements WorkflowStep {
  readonly steps: NamedWorkflowStep[]

  // Discriminates this from a generic WorkflowStep in type checking.
  // @ts-ignore
  private readonly _isStepsStep: boolean = true

  constructor(steps: NamedWorkflowStep[]) {
    this.steps = steps
  }

  render(): object {
    return {
      steps: renderSteps(this.steps),
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return this.steps
  }
}

export function stepsStep(
  name: GWStepName,
  steps: NamedWorkflowStep[]
): NamedWorkflowStep {
  return { name, step: new StepsStep(steps) }
}

// https://cloud.google.com/workflows/docs/reference/syntax/parallel-steps
export class Parallel implements WorkflowStep {
  // Steps for each branch
  readonly branches?: NamedWorkflowStep[]
  readonly forStep?: ForStep
  readonly shared?: GWVariableName[]
  readonly concurrenceLimit?: number

  constructor(
    steps: NamedWorkflowStep[] | ForStep,
    shared?: GWVariableName[],
    concurrencyLimit?: number
  ) {
    this.shared = shared
    this.concurrenceLimit = concurrencyLimit

    if (steps instanceof ForStep) {
      this.forStep = steps
    } else {
      this.branches = steps
    }
  }

  render(): object {
    return {
      parallel: {
        shared: this.shared,
        concurrency_limit: this.concurrenceLimit,
        branches: this.branches ? renderSteps(this.branches) : undefined,
        for: this.forStep ? this.forStep.renderBody() : undefined,
      },
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return (this.branches ?? []).concat(this.forStep?.steps ?? [])
  }
}

export function parallel(
  name: GWStepName,
  options:
    | {
        branches: NamedWorkflowStep[]
        shared?: GWVariableName[]
        concurrencyLimit?: number
      }
    | {
        forLoop: ForStep
        shared?: GWVariableName[]
        concurrencyLimit?: number
      }
): NamedWorkflowStep {
  const steps = 'branches' in options ? options.branches : options.forLoop
  return {
    name,
    step: new Parallel(steps, options.shared, options.concurrencyLimit),
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/completing
export class ReturnStep implements WorkflowStep {
  readonly value: GWValue

  constructor(value: GWValue) {
    this.value = value
  }

  render(): object {
    return {
      return: renderGWValue(this.value),
    }
  }

  nestedSteps(): NamedWorkflowStep[] {
    return []
  }
}

export function returnStep(
  name: GWStepName,
  value: GWValue
): NamedWorkflowStep {
  return { name, step: new ReturnStep(value) }
}

function renderSteps(steps: NamedWorkflowStep[]) {
  return steps.map((x) => {
    return { [x.name]: x.step.render() }
  })
}
