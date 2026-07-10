export const CHANGE_EVENT_NAME = "change" as const;

export function createCustomEventChangeDetail(
  entries: Array<[string, unknown]>,
  namespace?: string,
) {
  let details = Object.fromEntries(entries);

  if (entries.length === 1) {
    let [[type, detail]] = entries;
    let name = namespace ? `${namespace}:${type}` : undefined;
    return {
      type,
      ...(name ? { name } : {}),
      detail,
      details,
    };
  }

  let type = entries.map(([type]) => type);
  return {
    type,
    ...(namespace
      ? { name: type.map((eventType) => `${namespace}:${eventType}`) }
      : {}),
    detail: details,
    details,
  };
}
