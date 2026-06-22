// requestEventTarget.d.ts

import {
  SemanticEventTarget,
  EventShapeInit,
} from "./semanticEventTarget.js";

export type RequestEvent<Resp> =
  | { type: "requestSubmitted" }
  | { type: "requestErrored"; error: Error }
  | { type: "requestSucceeded"; response?: Resp }
  | { type: "idle" };

export type RequestEventTargetInit<Resp> = Omit<
  EventShapeInit<RequestEvent<Resp>, RequestEvent<Resp>>,
  "event" | "state"
>;

export interface RequestEventTarget<Resp>
  extends SemanticEventTarget<
    RequestEvent<Resp>,
    RequestEvent<Resp>,
    true
  > {}

export declare const RequestEventTarget: {
  new <Resp = unknown>(
    params?: RequestEventTargetInit<Resp>
  ): RequestEventTarget<Resp>;

  <Resp = unknown>(
    params?: RequestEventTargetInit<Resp>
  ): RequestEventTarget<Resp>;
};