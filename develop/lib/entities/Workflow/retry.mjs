export function retryCounterKey({ stepId, by, value, target }) {
  return `${stepId}:${by}:${value}->${target}`;
}

export function resolveRetryPolicy({ baton, stepId, by, value, policy }) {
  const currentAttempts = baton.state?.attempts?.[retryCounterKey({ stepId, by, value, target: policy.target })] ?? 0;
  const nextAttempt = currentAttempts + 1;

  if (nextAttempt > policy.maxAttempts) {
    return { targetStepId: policy.onLimit, attempts: baton.state?.attempts ?? {} };
  }

  return {
    targetStepId: policy.target,
    attempts: {
      ...(baton.state?.attempts ?? {}),
      [retryCounterKey({ stepId, by, value, target: policy.target })]: nextAttempt,
    },
  };
}
