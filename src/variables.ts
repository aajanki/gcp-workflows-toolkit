export type GWVariableName = string
export type GWValue =
  | null
  | string
  | number
  | boolean
  | GWValue[]
  | { [key: string]: GWValue }
  | GWExpression

export function renderGWValue(
  val: GWValue
): null | string | number | boolean | object {
  if (val instanceof GWExpression) {
    return val.render()
  } else if (Array.isArray(val)) {
    return val.map(renderGWValue)
  } else if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, renderGWValue(v)])
    )
  } else {
    return val
  }
}

export class GWExpression {
  readonly expression: string

  constructor(ex: string) {
    // Detect injections. I don't know if these can be escaped somehow if used in string for example.
    if (ex.includes('$') || ex.includes('{') || ex.includes('}')) {
      throw new Error('Unsupported expression')
    }

    this.expression = ex
  }

  render(): string {
    return '${' + this.expression + '}'
  }
}

// A short-hand syntax for writing expression: $('a + 1')
export function $(ex: string): GWExpression {
  return new GWExpression(ex)
}
