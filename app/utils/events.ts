import { TypedEventTarget } from "remix/ui";

/**
 * Sets up a custom EventTarget instance that listens for only a single event type called "change" and
 * returns a `dispatcher` function to dispatch the "change" event with event details as the only argument to be passed in.
 * @param listenerCallback Listener to invoke when the "change" event fires.
 * @param options Listener registration options.
 * @returns A `dispatcher` function to dispatch the "change" event.
 */
export function createChangeEventListener<SemanticEvent>(
  listenerCallback: (evt: SemanticEvent) => void,
  options: AddEventListenerOptions
) {
  const eventTypePrefix = "change" as const;

  type EventMap = {
    [eventTypePrefix]: CustomEvent<SemanticEvent>;
  }

  class CustomEventTarget extends TypedEventTarget<EventMap> {
    constructor() {
      super()
      this.addEventListener(eventTypePrefix, (evt) => listenerCallback(evt.detail), options)
    }

    static instance = new CustomEventTarget()

    static dispatchChangeEvent (semanticEvent: CustomEventInit<SemanticEvent>['detail'] | undefined) {
      return CustomEventTarget.instance.dispatchEvent(new CustomEvent(eventTypePrefix, {detail: semanticEvent}))
    }
  }

  return CustomEventTarget.dispatchChangeEvent;
}
