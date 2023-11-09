import { CallStep, SwitchStep } from './steps'
import { BaseWorkflow, WorkflowApp } from './workflows'

export class WorkflowValidationError extends Error {
  issues: WorkflowIssue[]

  constructor(issues: WorkflowIssue[]) {
    super('Workflow validation error')
    this.name = this.constructor.name
    this.issues = issues
  }
}

export type WorkflowIssue = { type: string; message: string }

/**
 * Execute all syntax validators on a WorkflowApp app.
 *
 * Throws a WorkflowValidationError if there are errors.
 */
export function validate(app: WorkflowApp, disabled: string[] = []): void {
  const validators = new Map([
    ['invalidWorkflowName', validateWorkflowNames],
    ['duplicatedStepName', validateNoDuplicateStepNames],
    ['duplicatedSubworkflowName', validateNoDuplicateSubworkflowNames],
    ['missingJumpTarget', validateJumpTargets],
    ['wrongNumberOfCallArguments', validateSubworkflowArguments],
  ])

  for (const dis of disabled) {
    if (validators.has(dis)) {
      validators.delete(dis)
    }
  }

  const issues: WorkflowIssue[] = []
  for (const validator of validators.values()) {
    issues.push(...validator(app))
  }

  if (issues.length > 0) {
    throw new WorkflowValidationError(issues)
  }
}

/**
 * Check that workflow does not contain duplicated step names.
 */
function validateNoDuplicateStepNames(app: WorkflowApp): WorkflowIssue[] {
  function collectDuplicateStepName(wf: BaseWorkflow): string[] {
    const seen: Set<string> = new Set()
    const duplicates: Set<string> = new Set()

    for (const { name } of wf.iterateStepsDepthFirst()) {
      if (seen.has(name)) {
        duplicates.add(name)
      } else {
        seen.add(name)
      }
    }

    return Array.from(duplicates.values())
  }

  const issues: WorkflowIssue[] = []
  const duplicatesInMain = collectDuplicateStepName(app.mainWorkflow)

  if (duplicatesInMain.length > 0) {
    const message = `Duplicated step names in the main workflow: ${duplicatesInMain.join(
      ', '
    )}`
    issues.push({ type: 'duplicatedStepName', message: message })
  }

  for (const subworkflow of app.subworkflows) {
    const duplicatesInSub = collectDuplicateStepName(subworkflow)

    if (duplicatesInSub.length > 0) {
      const message = `Duplicated step names in the subworkflow ${
        subworkflow.name
      }: ${duplicatesInSub.join(', ')}`
      issues.push({ type: 'duplicatedStepName', message: message })
    }
  }

  return issues
}

/**
 * Check that there are no two subworkflows sharing a name.
 */
function validateNoDuplicateSubworkflowNames(
  app: WorkflowApp
): WorkflowIssue[] {
  const seen: Set<string> = new Set()
  const duplicates: Set<string> = new Set()
  const names = app.subworkflows.map((w) => w.name)

  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name)
    } else {
      seen.add(name)
    }
  }

  if (duplicates.size > 0) {
    const dup = Array.from(duplicates)
    return [
      {
        type: 'duplicatedSubworkflowName',
        message: `Duplicated subworkflow names: ${dup.join(', ')}`,
      },
    ]
  } else {
    return []
  }
}

/**
 * Check that the subworkflow names are valid.
 */
function validateWorkflowNames(app: WorkflowApp): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const names = app.subworkflows.map((w) => w.name)

  if (names.some((x) => x === 'main')) {
    issues.push({
      type: 'invalidWorkflowName',
      message: 'Subworkflow can\'t be called "main"',
    })
  }

  if (names.some((x) => x === '')) {
    issues.push({
      type: 'invalidWorkflowName',
      message: 'Subworkflow must have a non-empty name',
    })
  }

  return issues
}

/**
 * Check that there are no jumps (calls, nexts) to non-existing steps or subworkflows
 */
function validateJumpTargets(app: WorkflowApp): WorkflowIssue[] {
  const subworkflowNames = app.subworkflows.map((w) => w.name)
  const issues = validateJumpTargetsInWorkflow(
    app.mainWorkflow,
    subworkflowNames
  )
  const issuesSubWorflows = app.subworkflows.flatMap((subworkflow) => {
    return validateJumpTargetsInWorkflow(subworkflow, subworkflowNames)
  })

  return issues.concat(issuesSubWorflows)
}

function validateJumpTargetsInWorkflow(
  workflow: BaseWorkflow,
  subworkflowNames: string[]
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const stepNames: string[] = []
  for (const { name } of workflow.iterateStepsDepthFirst()) {
    stepNames.push(name)
  }

  function validCallTarget(name: string) {
    return (
      isRuntimeFunction(name) ||
      stepNames.includes(name) ||
      subworkflowNames.includes(name)
    )
  }

  function validNextTarget(name: string) {
    return stepNames.includes(name) || name === 'end' // accepts "next: end"
  }

  for (const { name, step } of workflow.iterateStepsDepthFirst()) {
    if (step instanceof CallStep) {
      if (!validCallTarget(step.call))
        issues.push({
          type: 'missingJumpTarget',
          message: `Call target "${step.call}" in step "${name}" not found`,
        })
    } else if (step instanceof SwitchStep) {
      if (step.next && !validNextTarget(step.next)) {
        issues.push({
          type: 'missingJumpTarget',
          message: `Next target "${step.next}" in step "${name}" not found`,
        })
      }

      step.conditions.forEach((cond) => {
        if (cond.next && !validNextTarget(cond.next)) {
          issues.push({
            type: 'missingJumpTarget',
            message: `Next target "${cond.next}" in step "${name}" not found`,
          })
        }
      })
    }
  }

  return issues
}

/**
 * Check that call steps provide a correct number of argument in subworkflow calls
 */
function validateSubworkflowArguments(app: WorkflowApp): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []

  const paramsBySubworkflow = new Map(
    app.subworkflows.map((x) => [
      x.name,
      {
        required:
          x.params
            ?.filter((x) => typeof x.default === 'undefined')
            .map((x) => x.name) ?? [],
        optional:
          x.params
            ?.filter((x) => typeof x.default !== 'undefined')
            .map((x) => x.name) ?? [],
      },
    ])
  )

  issues.push(
    ...findIssuesInCallArguments(app.mainWorkflow, paramsBySubworkflow)
  )
  app.subworkflows.forEach((subw) => {
    issues.push(...findIssuesInCallArguments(subw, paramsBySubworkflow))
  })

  return issues
}

function findIssuesInCallArguments(
  wf: BaseWorkflow,
  argumentBySubworkflowName: Map<
    string,
    { required: string[]; optional: string[] }
  >
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []

  for (const { name, step } of wf.iterateStepsDepthFirst()) {
    if (step instanceof CallStep && argumentBySubworkflowName.has(step.call)) {
      const requiredArgs =
        argumentBySubworkflowName.get(step.call)?.required ?? []
      const optionalArgs =
        argumentBySubworkflowName.get(step.call)?.optional ?? []
      const requiredAndOptionalArgs = requiredArgs.concat(optionalArgs)
      const providedArgs = Object.keys(step.args ?? {})
      const requiredButNotProvided = requiredArgs.filter(
        (x) => !providedArgs.includes(x)
      )
      const providedButNotRequired = providedArgs.filter(
        (x) => !requiredAndOptionalArgs.includes(x)
      )

      if (requiredButNotProvided.length > 0) {
        issues.push({
          type: 'wrongNumberOfCallArguments',
          message: `Required parameters not provided on call step "${name}": ${JSON.stringify(
            requiredButNotProvided
          )}`,
        })
      }

      if (providedButNotRequired.length > 0) {
        issues.push({
          type: 'wrongNumberOfCallArguments',
          message: `Extra arguments provided on call step "${name}": ${JSON.stringify(
            providedButNotRequired
          )}`,
        })
      }
    }
  }

  return issues
}

/**
 * Returns true if functionName is a standard library or connector function.
 *
 * Current version does a minimalistic checking and assumes that a name is a
 * standard library function if it contains a dot.
 */
function isRuntimeFunction(functionName: string) {
  return functionName.includes('.')
}
