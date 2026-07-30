/**
 * Resolve the exact prompt to submit.
 *
 * The live textarea value takes precedence over the last controlled React
 * value so an album-recalled prompt cannot win over a newer user edit.
 *
 * @param {string | null | undefined} livePrompt
 * @param {string} controlledPrompt
 * @returns {string}
 */
export function getSubmittedPrompt(livePrompt, controlledPrompt) {
  return (typeof livePrompt === 'string' ? livePrompt : controlledPrompt).trim();
}
