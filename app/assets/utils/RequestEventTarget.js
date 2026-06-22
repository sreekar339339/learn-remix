import { SemanticEventTarget } from "./SemanticEventTarget.js";

export function RequestEventTarget(params = {}) {
  return new SemanticEventTarget({
    ...params,
    event: { type: "idle" },
  });
}
