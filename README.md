# Toolkit for writing GCP Workflows applications

A Typescript library for writing [Google Cloud Workflows](https://cloud.google.com/workflows/docs/reference/syntax).

Status: very experimental, only subset of Workflows features are supported

By writing a workflow definition in Typescript, we can employ the Typescript type checking to catch many potential errors already during development stage.

### Sample

This program

```typescript
const mainWorkflow = new MainWorkflow([
  new CallStep('call_subworkflow', {
    call: 'say_hello',
    args: {
      name: 'Leela',
    },
  }),
])

const subworkflow = new Subworkflow(
  'say_hello',
  [
    new CallStep('log_greetings', {
      call: 'sys.log',
      args: {
        text: $('"Hello, " + name'),
      },
    }),
  ],
  ['name']
)

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
