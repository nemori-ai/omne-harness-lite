/** Private method projection. Its source component retains the one physical task state. */
const projection = Symbol('runtime-component-projection')

export type ProjectedComponent<C extends object, I> = C & {
  readonly [projection]: (input: I) => C
}

export function retainRuntimeProjection<C extends object, I>(
  component: C,
  project: (input: I) => NoInfer<C>,
): ProjectedComponent<C, I> {
  return Object.freeze({ ...component, [projection]: project })
}

export function projectRuntimeComponent<C extends object, I>(
  component: ProjectedComponent<C, I>,
  input: I,
): C {
  return component[projection](input)
}
