import type { GWValue, GWVariableName } from './variables'
import { GWExpression, renderGWValue } from './variables'

export type GWStepName = string
export type GWAssignment = readonly [GWVariableName, GWValue]
export type GWArguments = Record<GWVariableName, GWValue>

export interface WorkflowStep {
  readonly name: GWStepName

  render(): object
}

// https://cloud.google.com/workflows/docs/reference/syntax/variables#assign-step
export class AssignStep implements WorkflowStep {
  readonly name: GWStepName
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

// https://cloud.google.com/workflows/docs/reference/syntax/calls
export class CallStep implements WorkflowStep {
  readonly name: GWStepName
  readonly call: string
  readonly args?: GWArguments
  readonly result?: string

  constructor(
    name: GWStepName,
    options: { call: string; args?: GWArguments; result?: string }
  ) {
    this.name = name
    this.call = options.call
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

// A class representing the individual branches of a switch step
export class SwitchCondition {
  readonly condition: GWExpression
  readonly next?: GWStepName
  readonly steps?: WorkflowStep[]

  constructor(
    condition: GWExpression,
    options: { next?: WorkflowStep; steps?: WorkflowStep[] }
  ) {
    if ((options.next && options.steps) || (!options.next && !options.steps)) {
      throw new Error(
        'Exactly one of "next" or "steps" must be defined in a switch condition'
      )
    }

    this.condition = condition
    this.next = options.next?.name
    this.steps = options.steps
  }

  render(): object {
    return {
      condition: this.condition.render(),
      next: this.next,
      steps: this.steps?.map((x) => x.render()),
    }
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/conditions
export class SwitchStep implements WorkflowStep {
  readonly name: GWStepName
  readonly conditions: SwitchCondition[]
  readonly next?: GWStepName

  constructor(
    name: GWStepName,
    options: { conditions: SwitchCondition[]; next?: WorkflowStep }
  ) {
    this.name = name
    this.conditions = options.conditions
    this.next = options.next?.name
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

// https://cloud.google.com/workflows/docs/reference/syntax/catching-errors
export class TryStep implements WorkflowStep {
  readonly name: GWStepName
  readonly steps: WorkflowStep[]
  readonly errorMap?: GWStepName
  readonly exceptSteps: WorkflowStep[]

  constructor(
    name: GWStepName,
    options: {
      steps: WorkflowStep[]
      errorMap?: GWVariableName
      exceptSteps: WorkflowStep[]
    }
  ) {
    this.name = name
    this.steps = options.steps
    this.errorMap = options.errorMap
    this.exceptSteps = options.exceptSteps
  }

  render(): object {
    return {
      [this.name]: {
        try: {
          steps: this.steps.map((x) => x.render()),
        },
        except: {
          as: this.errorMap,
          steps: this.exceptSteps.map((x) => x.render()),
        },
      },
    }
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/raising-errors
export class RaiseStep implements WorkflowStep {
  readonly name: GWStepName
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

// https://cloud.google.com/workflows/docs/reference/syntax/completing
export class EndStep implements WorkflowStep {
  readonly name: GWStepName = 'end'

  render(): object {
    return {}
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/completing
export class ReturnStep implements WorkflowStep {
  readonly name: GWStepName
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
