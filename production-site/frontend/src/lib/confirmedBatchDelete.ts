export function confirmedBatchDeleteMatches(confirmedIds: readonly string[] | null, currentIds: readonly string[]) {
  if (!confirmedIds || !currentIds.length || confirmedIds.length !== currentIds.length) return false;
  const confirmed = new Set(confirmedIds);
  return confirmed.size === confirmedIds.length && currentIds.every((id) => confirmed.has(id));
}
