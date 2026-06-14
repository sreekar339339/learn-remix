import { TypedEventTarget } from "remix/ui";

/**
 * Sets up a custom EventTarget instance that listens for only a single event type called "change" and
 * returns a `dispatcher` function to dispatch the "change" event with event details as the only argument to be passed in.
 * @param listenerCallback Listener to invoke when the "change" event fires.
 * @param options Listener registration options.
 * @returns A `dispatcher` function to dispatch the "change" event.
 */
export function createChangeEventListener<EventDetail>(
  listenerCallback: (evt: CustomEvent<EventDetail>) => void,
  options: AddEventListenerOptions
) {
  const eventType = "change" as const;

  type EventMap = {
    [eventType]: CustomEvent<EventDetail>;
  }

  class CustomEventTarget extends TypedEventTarget<EventMap> {
    constructor() {
      super()
      this.addEventListener(eventType, listenerCallback, options)
    }

    static instance = new CustomEventTarget()

    static dispatchChangeEvent (eventDetail: CustomEventInit<EventDetail>['detail'] | undefined) {
      return CustomEventTarget.instance.dispatchEvent(new CustomEvent(eventType, {detail: eventDetail}))
    }
  }

  return CustomEventTarget.dispatchChangeEvent;
}
