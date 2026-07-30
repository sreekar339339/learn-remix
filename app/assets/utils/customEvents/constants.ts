export const CUSTOM_EVENTS_EVENT_PREFIX = "rmx:custom-events";
export const CUSTOM_EVENTS_ABORTED = `${CUSTOM_EVENTS_EVENT_PREFIX}:aborted`;
export const CUSTOM_EVENTS_ALL = "*";
export const CUSTOM_EVENTS_TRANSACTION = "$transaction";

let customEventsOwnerId = 0;

export function createCustomEventsOwnerId() {
  customEventsOwnerId += 1;
  return customEventsOwnerId.toString(36);
}
