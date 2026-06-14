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
  const eventTypePrefix = "@";

  class SemanticEventTarget extends TypedEventTarget<{
    [eventTypePrefix]: CustomEvent<SemanticEvent>;
  }> {
    constructor() {
      super();
      this.addEventListener(
        eventTypePrefix,
        (evt) => listenerCallback(evt.detail),
        options,
      );
    }

    static instance = new SemanticEventTarget();

    static dispatchSemanticEvent(
      semanticEvent: CustomEventInit<SemanticEvent>["detail"] | undefined,
    ) {
      return SemanticEventTarget.instance.dispatchEvent(
        new CustomEvent(eventTypePrefix, { detail: semanticEvent }),
      );
    }
  }

  return SemanticEventTarget.dispatchSemanticEvent;
}
