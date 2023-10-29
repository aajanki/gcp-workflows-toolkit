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
