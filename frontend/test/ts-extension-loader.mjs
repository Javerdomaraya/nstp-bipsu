/**
 * Resolves the project's extensionless relative imports (`'../data/nstpData'`)
 * to their `.ts` files so plain `node --test` can execute TypeScript modules
 * that Vite would normally resolve.
 *
 * Test tooling only: no production module is changed, and nothing here is
 * bundled. It exists because the workspace's `vitest` cannot start in every
 * environment (its Rollup binary is platform-specific), and a security
 * regression suite that cannot be executed is not a regression suite.
 */

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Try the next candidate; the original error is rethrown below.
      }
    }
    throw error;
  }
}
