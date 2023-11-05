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
export function validate(app: WorkflowApp): void {
  const validators = [
    validateNoDuplicateStepNames,
    validateWorkflowNames,
    validateNoDuplicateSubworkflowNames,
    validateJumpTargets,
  ]

  const issues: WorkflowIssue[] = []
  for (const validator of validators) {
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

    for (const step of wf.iterateStepsDepthFirst()) {
      if (seen.has(step.name)) {
        duplicates.add(step.name)
      } else {
        seen.add(step.name)
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

function validateJumpTargets(app: WorkflowApp): WorkflowIssue[] {
  const subworkflowNames = app.subworkflows.map((w) => w.name)
  const issues = validateJumpTargetsInWorkflow(app.mainWorkflow, subworkflowNames)
  const issuesSubWorflows = app.subworkflows.flatMap((subworkflow) => {
    return validateJumpTargetsInWorkflow(subworkflow, subworkflowNames)
  })

  return issues.concat(issuesSubWorflows)
}

function validateJumpTargetsInWorkflow(workflow: BaseWorkflow, subworkflowNames: string[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  const stepNames: string[] =  []
  for (const step of workflow.iterateStepsDepthFirst()) {
    stepNames.push(step.name)
  }

  function validCallTarget(name: string) {
    return isRuntimeFunction(name) || stepNames.includes(name) || subworkflowNames.includes(name)
  }

  function validNextTarget(name: string) {
    return stepNames.includes(name) || name === 'end' // accepts "next: end"
  }

  for (const step of workflow.iterateStepsDepthFirst()) {
    if (step instanceof CallStep) {
      if (!validCallTarget(step.call))
      issues.push({
        type: 'missingJumpTarget',
        message: `Call target "${step.call}" in step "${step.name}" not found`,
      })
    } else if (step instanceof SwitchStep) {
      if (step.next && !validNextTarget(step.next)) {
        issues.push({
          type: 'missingJumpTarget',
          message: `Next target "${step.next}" in step "${step.name}" not found`,
        })
      }

      step.conditions.forEach((cond) => {
        if (cond.next && !validNextTarget(cond.next.name)) {
          issues.push({
            type: 'missingJumpTarget',
            message: `Next target "${cond.next.name}" in step "${step.name}" not found`,
          })
        }
      })
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
