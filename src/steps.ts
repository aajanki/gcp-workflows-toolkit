import * as _ from 'lodash'

import type { GWValue, GWVariableName } from './variables'
import { GWExpression, renderGWValue } from './variables'
import { Subworkflow } from './workflows'

export type GWStepName = string
export type GWAssignment = readonly [GWVariableName, GWValue]
export type GWArguments = Record<GWVariableName, GWValue>

export interface WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[]

  render(): object
}

// https://cloud.google.com/workflows/docs/reference/syntax/variables#assign-step
export class AssignStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[] = []
  readonly assignments: Array<GWAssignment>

  constructor(name: GWStepName, assignments: Array<GWAssignment>) {
    this.name = name
    this.assignments = assignments
  }

  render(): object {
    return {
      [this.name]: {
        assign: this.assignments.map(([key, val]) => {
          return { [key]: renderGWValue(val) }
        }),
      },
    }
  }
}

export function assign(name: GWStepName, assignments: Array<GWAssignment>) {
  return new AssignStep(name, assignments)
}

// https://cloud.google.com/workflows/docs/reference/syntax/calls
export class CallStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[] = []
  readonly call: string
  readonly args?: GWArguments
  readonly result?: string

  /**
   * Construct a call step.
   *
   * @param name step name
   * @param options.call a Subworkflow or standard library function name as string
   * @param options.args argument values
   * @param options.result name of the variable where the function output will be stored
   */
  constructor(
    name: GWStepName,
    options: { call: Subworkflow | string; args?: GWArguments; result?: string }
  ) {
    this.name = name
    if (options.call instanceof Subworkflow) {
      const neededArgs = options.call.params ?? []
      const providedArgs = Object.keys(options.args ?? {})
      const needBuNotProvided = _.difference(neededArgs, providedArgs)
      const providedButNotNeeded = _.difference(providedArgs, neededArgs)

      if (needBuNotProvided.length > 0) {
        throw new Error(
          `Required parameter not provided on call step "${name}": ${needBuNotProvided.join(
            ', '
          )}`
        )
      }
      if (providedButNotNeeded.length > 0) {
        throw new Error(
          `Extra arguments provided for call step "${name}": ${providedButNotNeeded.join(
            ', '
          )}`
        )
      }

      this.call = options.call.name
    } else {
      this.call = options.call
    }
    this.args = options.args
    this.result = options.result
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
      [this.name]: {
        call: this.call,
        args: renderedArgs,
        result: this.result,
      },
    }
  }
}

export function call(
  name: GWStepName,
  options: { call: Subworkflow | string; args?: GWArguments; result?: string }
) {
  return new CallStep(name, options)
}

// A class representing the individual branches of a switch step
export class SwitchCondition {
  readonly condition: GWExpression
  readonly next?: WorkflowStep
  readonly steps: WorkflowStep[]

  constructor(
    condition: GWExpression,
    options: { next: WorkflowStep } | { steps: WorkflowStep[] }
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
      next: this.next?.name,
      steps:
        this.steps.length > 0 ? this.steps.map((x) => x.render()) : undefined,
    }
  }
}

export function condition(
  expression: GWExpression,
  options: { next: WorkflowStep } | { steps: WorkflowStep[] }
) {
  return new SwitchCondition(expression, options)
}

// https://cloud.google.com/workflows/docs/reference/syntax/conditions
export class SwitchStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[]
  readonly conditions: SwitchCondition[]
  readonly next?: GWStepName

  constructor(
    name: GWStepName,
    options: { conditions: SwitchCondition[]; next?: WorkflowStep }
  ) {
    this.name = name
    this.conditions = options.conditions
    this.next = options.next?.name

    if (options.next) {
      this.nestedSteps = []
    } else {
      this.nestedSteps = this.conditions.flatMap((cond) => {
        if (cond.steps) {
          return cond.steps
        } else {
          return []
        }
      })
    }
  }

  render(): object {
    return {
      [this.name]: {
        switch: this.conditions.map((cond) => cond.render()),
        next: this.next,
      },
    }
  }
}

export function switchStep(
  name: GWStepName,
  options: { conditions: SwitchCondition[]; next?: WorkflowStep }
) {
  return new SwitchStep(name, options)
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
  readonly name: GWStepName
  readonly retryPolicy?: string | CustomRetryPolicy
  readonly errorMap?: GWStepName
  // Steps in the try block
  readonly trySteps: WorkflowStep[]
  // Steps in the except block
  readonly exceptSteps: WorkflowStep[]
  // All steps from both of the blocks
  readonly nestedSteps: WorkflowStep[]

  constructor(
    name: GWStepName,
    options: {
      steps: WorkflowStep[]
      retryPolicy?: DefaultRetryPolicy | CustomRetryPolicy
      errorMap?: GWVariableName
      exceptSteps: WorkflowStep[]
    }
  ) {
    this.name = name
    this.trySteps = options.steps
    this.retryPolicy = options.retryPolicy
    this.errorMap = options.errorMap
    this.exceptSteps = options.exceptSteps
    this.nestedSteps = (options.steps ?? []).concat(options.exceptSteps ?? [])
  }

  render(): object {
    let retry
    if (typeof this.retryPolicy === 'undefined') {
      retry = undefined
    } else if (typeof this.retryPolicy === 'string') {
      retry = `\$\{${this.retryPolicy}\}`
    } else {
      const predicateName =
        typeof this.retryPolicy.predicate === 'string'
          ? this.retryPolicy.predicate
          : this.retryPolicy.predicate.name
      retry = {
        predicate: `\$\{${predicateName}\}`,
        max_retries: this.retryPolicy.maxRetries,
        backoff: {
          initial_delay: this.retryPolicy.backoff.initialDelay,
          max_delay: this.retryPolicy.backoff.maxDelay,
          multiplier: this.retryPolicy.backoff.multiplier,
        },
      }
    }

    return {
      [this.name]: {
        try: {
          steps: this.trySteps.map((x) => x.render()),
        },
        retry: retry,
        except: {
          as: this.errorMap,
          steps: this.exceptSteps.map((x) => x.render()),
        },
      },
    }
  }
}

export function tryExcept(
  name: GWStepName,
  options: {
    steps: WorkflowStep[]
    retryPolicy?: DefaultRetryPolicy | CustomRetryPolicy
    errorMap?: GWVariableName
    exceptSteps: WorkflowStep[]
  }
) {
  return new TryExceptStep(name, options)
}

// https://cloud.google.com/workflows/docs/reference/syntax/raising-errors
export class RaiseStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[] = []
  readonly value: GWValue

  constructor(name: GWStepName, value: GWValue) {
    this.name = name
    this.value = value
  }

  render(): object {
    return {
      [this.name]: {
        raise: renderGWValue(this.value),
      },
    }
  }
}

export function raise(name: GWStepName, value: GWValue) {
  return new RaiseStep(name, value)
}

export class ForStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[]
  readonly loopVariableName: GWVariableName
  readonly indexVariableName?: GWVariableName
  readonly listExpression: GWExpression | GWValue[]

  constructor(
    name: GWStepName,
    options: {
      steps: WorkflowStep[]
      loopVariable: GWVariableName
      indexVariable?: GWVariableName
      listExpression: GWExpression | GWValue[]
    }
  ) {
    this.name = name
    this.nestedSteps = options.steps
    this.loopVariableName = options.loopVariable
    this.indexVariableName = options.indexVariable
    this.listExpression = options.listExpression
  }

  render(): object {
    return {
      [this.name]: {
        for: {
          value: this.loopVariableName,
          index: this.indexVariableName,
          in: renderGWValue(this.listExpression),
          steps: this.nestedSteps.map((x) => x.render()),
        },
      },
    }
  }
}

export function forStep(
  name: GWStepName,
  options: {
    steps: WorkflowStep[]
    loopVariable: GWVariableName
    indexVariable?: GWVariableName
    listExpression: GWExpression | GWValue[]
  }
) {
  return new ForStep(name, options)
}

// https://cloud.google.com/workflows/docs/reference/syntax/steps#embedded-steps
export class StepsStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[]

  // Discriminates this from a generic WorkflowStep in type checking.
  // @ts-ignore
  private readonly _isStepsStep: boolean = true

  constructor(name: GWStepName, steps: WorkflowStep[]) {
    this.name = name
    this.nestedSteps = steps
  }

  render(): object {
    return {
      [this.name]: {
        steps: this.nestedSteps.map((x) => x.render()),
      },
    }
  }
}

export function steps(name: GWStepName, steps: WorkflowStep[]) {
  return new StepsStep(name, steps)
}

// https://cloud.google.com/workflows/docs/reference/syntax/parallel-steps
export class Parallel implements WorkflowStep {
  readonly name: GWStepName
  // Steps for each branch
  readonly branches?: StepsStep[]
  readonly forStep?: ForStep
  // All steps merged from all branches/for
  readonly nestedSteps: WorkflowStep[]
  readonly shared?: GWVariableName[]
  readonly concurrenceLimit?: number

  constructor(
    name: GWStepName,
    options:
      | {
          branches: StepsStep[]
          shared?: GWVariableName[]
          concurrencyLimit?: number
        }
      | {
          forLoop: ForStep
          shared?: GWVariableName[]
          concurrencyLimit?: number
        }
  ) {
    this.name = name
    this.shared = options.shared
    this.concurrenceLimit = options.concurrencyLimit

    if ('branches' in options) {
      this.branches = options.branches
      this.nestedSteps = options.branches.flatMap((x) => x.nestedSteps)
    } else {
      this.forStep = options.forLoop
      this.nestedSteps = options.forLoop.nestedSteps
    }
  }

  render(): object {
    let forBody = undefined
    if (this.forStep) {
      forBody = {
        value: this.forStep.loopVariableName,
        index: this.forStep.indexVariableName,
        in: renderGWValue(this.forStep.listExpression),
        steps: this.forStep.nestedSteps.map((x) => x.render()),
      }
    }

    return {
      [this.name]: {
        parallel: {
          shared: this.shared,
          concurrency_limit: this.concurrenceLimit,
          branches: this.branches?.map((x) => x.render()),
          for: forBody,
        },
      },
    }
  }
}

export function parallel(
  name: GWStepName,
  options:
    | {
        branches: StepsStep[]
        shared?: GWVariableName[]
        concurrencyLimit?: number
      }
    | {
        forLoop: ForStep
        shared?: GWVariableName[]
        concurrencyLimit?: number
      }
) {
  return new Parallel(name, options)
}

// https://cloud.google.com/workflows/docs/reference/syntax/completing
export class EndStep implements WorkflowStep {
  readonly name: GWStepName = 'end'
  readonly nestedSteps: WorkflowStep[] = []

  render(): object {
    return {}
  }
}

export function end() {
  return new EndStep()
}

// https://cloud.google.com/workflows/docs/reference/syntax/completing
export class ReturnStep implements WorkflowStep {
  readonly name: GWStepName
  readonly nestedSteps: WorkflowStep[] = []
  readonly value: GWValue

  constructor(name: GWStepName, value: GWValue) {
    this.name = name
    this.value = value
  }

  render(): object {
    return {
      [this.name]: {
        return: renderGWValue(this.value),
      },
    }
  }
}

export function returnStep(name: GWStepName, value: GWValue) {
  return new ReturnStep(name, value)
}
