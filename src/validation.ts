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
 * Execute all syntax validators on this WorkflowApp.
 *
 * Throws an Error if there is validation errors.
 */
export function validate(app: WorkflowApp): void {
  const issues = validateNoDuplicateStepNames(app)

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
