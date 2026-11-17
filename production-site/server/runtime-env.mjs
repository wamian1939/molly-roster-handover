export let runtimeEnv={NODE_ENV:'production'};
export function configureRuntime(env){runtimeEnv={...env,NODE_ENV:'production'}}
