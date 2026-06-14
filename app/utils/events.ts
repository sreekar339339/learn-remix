import { TypedEventTarget } from "remix/ui";

/**
 * @param listenerCallback Listener to invoke when the semantic event fires.
 * @param options Listener registration options.
 * @returns A `dispatcher` function to dispatch a semantic event.
 */
export function createSemanticEventListener<SemanticEvent>(
  listenerCallback: (evt: SemanticEvent) => void,
  options: AddEventListenerOptions,
) {
  const semanticEventTypePrefix = "@";

  class SemanticEventTarget extends TypedEventTarget<{
    [semanticEventTypePrefix]: CustomEvent<SemanticEvent>;
  }> {
    constructor() {
      super();
      this.addEventListener(
        semanticEventTypePrefix,
        (evt) => listenerCallback(evt.detail),
        options,
      );
    }

    static instance = new SemanticEventTarget();

    static dispatchSemanticEvent(
      semanticEvent: SemanticEvent | undefined,
    ) {
      return SemanticEventTarget.instance.dispatchEvent(
        new CustomEvent(semanticEventTypePrefix, { detail: semanticEvent }),
      );
    }
  }

  return SemanticEventTarget.dispatchSemanticEvent;
}
