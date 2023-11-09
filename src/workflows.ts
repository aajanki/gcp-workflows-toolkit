import * as YAML from 'yaml'

import { NamedWorkflowStep } from './steps'
import { GWValue, GWVariableName } from './variables'

export interface WorkflowParameter {
  name: GWVariableName
  default?: GWValue
}

/**
 * This is the main container class that combines main and subworkflows
 */
export class WorkflowApp {
  readonly mainWorkflow: MainWorkflow
  readonly subworkflows: Subworkflow[]

  constructor(mainWorkflow: MainWorkflow, subworkflows: Subworkflow[] = []) {
    this.mainWorkflow = mainWorkflow
    this.subworkflows = subworkflows
  }

  render(): object {
    const merged = new Map()

    merged.set(this.mainWorkflow.name, this.mainWorkflow.renderBody())

    this.subworkflows.forEach((w) => {
      merged.set(w.name, w.renderBody())
    })

    return Object.fromEntries(merged)
  }
}

export class BaseWorkflow {
  readonly name: string
  readonly steps: NamedWorkflowStep[]
  readonly params?: WorkflowParameter[]

  constructor(
    name: string,
    steps: NamedWorkflowStep[],
    params?: WorkflowParameter[]
  ) {
    this.name = name
    this.steps = steps
    this.params = params
  }

  render(): object {
    return {
      [this.name]: this.renderBody(),
    }
  }

  renderBody(): object {
    return {
      params: this.params?.map((x) => {
        if (x.default) {
          return { [x.name]: x.default }
        } else {
          return x.name
        }
      }),
      steps: this.steps.map(({ name, step }) => {
        return { [name]: step.render() }
      }),
    }
  }

  *iterateStepsDepthFirst(): IterableIterator<NamedWorkflowStep> {
    const visited = new Set()

    function* visitPreOrder(
      step: NamedWorkflowStep
    ): IterableIterator<NamedWorkflowStep> {
      if (!visited.has(step)) {
        visited.add(step)

        yield step

        for (const x of step.step.nestedSteps()) {
          yield* visitPreOrder(x)
        }
      }
    }

    for (const step of this.steps) {
      yield* visitPreOrder(step)
    }
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/subworkflows
export class Subworkflow extends BaseWorkflow {
  constructor(
    name: string,
    steps: NamedWorkflowStep[],
    params?: WorkflowParameter[]
  ) {
    super(name, steps, params)
  }
}

// https://cloud.google.com/workflows/docs/reference/syntax/subworkflows#main-block
export class MainWorkflow extends BaseWorkflow {
  constructor(steps: NamedWorkflowStep[], argumentName?: GWVariableName) {
    const paramsArray = argumentName ? [{ name: argumentName }] : undefined
    super('main', steps, paramsArray)
  }
}

/**
 * Print the workflow as a YAML string.
 */
export function toYAMLString(workflow: WorkflowApp): string {
  return YAML.stringify(workflow.render())
}
