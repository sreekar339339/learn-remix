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
  const eventTypePrefix = '@'

  const evt = new EventTarget() as TypedEventTarget<{
    [eventTypePrefix]: CustomEvent<SemanticEvent>
  }>

  evt.addEventListener(
    eventTypePrefix,
    (evt) => listenerCallback(evt.detail),
    options,
  )

  return function dispatchSemanticEvent(
    semanticEvent: SemanticEvent | undefined,
  ) {
    return evt.dispatchEvent(
      new CustomEvent(eventTypePrefix, { detail: semanticEvent }),
    )
  }
}