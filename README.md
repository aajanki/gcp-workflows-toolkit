# Toolkit for writing GCP Workflows applications

A Typescript library for writing [Google Cloud Workflows](https://cloud.google.com/workflows/docs/reference/syntax).

Status: beta, not all workflow features are supported.

By writing a workflow definition in Typescript, we can employ the Typescript type checking to catch many potential errors already during development stage.

### Sample

This program

```typescript
const subworkflow = new Subworkflow(
  'say_hello',
  [
    call('log_greetings', {
      call: 'sys.log',
      args: {
        text: $('"Hello, " + name'),
      },
    }),
  ],
  ['name']
)

const mainWorkflow = new MainWorkflow([
  call('call_subworkflow', {
    call: subworkflow,
    args: {
      name: 'Leela',
    },
  }),
])

const workflow = new WorkflowApp(mainWorkflow, [subworkflow])

console.log(toYAMLString(workflow))
```

outputs this Workflows definition:

```yaml
main:
  steps:
    - call_subworkflow:
        call: say_hello
        args:
          name: Leela
say_hello:
  params:
    - name
  steps:
    - log_greetings:
        call: sys.log
        args:
          text: ${"Hello, " + name}
```

More samples:

```
npx ts-node examples/examples2.ts
```

### Validating a workflow definition

The `validate()` function checks the workflow definition for common errors. If it detects an error, it throws a WorkflowValidationError.

```typescript
const workflow = new WorkflowApp(...)
validate(workflow)
```

Currently implemented validators:

- `"invalidWorkflowName"` checks that the workflow names are valid
- `"duplicatedStepName"` checks that there are no duplicated step names in the workflow
- `"duplicatedSubworkflowName"` checks that there are not duplicated subworkflow names
- `"missingJumpTarget"` checks that call and next steps targets exist
- `"wrongNumberOfCallArguments"` checks that a correct number of arguments is provided in subworkflow call

It if possible to disable certain validator by listing the names of validators-to-be-disabled as the second argument to the `validate()` call. This might be handy, for example, if a validator is buggy and reject a valid workflow.

```typescript
const workflow = new WorkflowApp(...)
const disabled = ["missingJumpTarget"]

validate(workflow, disabled)
```
