/** Until physical-device sign-off, real sends must target one consenting tester
 * and one test notice. Missing or partial scope never enables a broad send. */
export function pushTestScope(env: NodeJS.ProcessEnv = process.env) {
  const userId = env.IROUN_PUSH_TEST_USER_ID;
  const benefitId = env.IROUN_PUSH_TEST_BENEFIT_ID;
  if (env.IROUN_PUSH_TEST_CONSENT_CONFIRMED !== "true" ||
      !userId || !/^[a-zA-Z0-9_-]{1,200}$/.test(userId) ||
      !benefitId || !/^[a-zA-Z0-9_-]{1,80}$/.test(benefitId)) return null;
  return { userId, benefitId };
}
