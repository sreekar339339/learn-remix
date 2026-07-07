import { createMixin, on } from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
  type DispatchCustomEvent,
  type Namespaced,
} from "./utils/customEvent.ts";

type DragReleaseEventMap = CustomEventMap<{
  release: { velocityX: number; velocityY: number };
}>;

type DraggableNamespace = "rmx:drag";

declare global {
  interface HTMLElementEventMap extends Namespaced<
    DragReleaseEventMap,
    DraggableNamespace
  > {}
}

export let dragRelease = createMixin<HTMLElement>((handle) => {
  let target: HTMLElement | undefined;
  let tracking = false;
  let velocityX = 0;
  let velocityY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let dispatch: DispatchCustomEvent<HTMLElement, DraggableNamespace>;

  handle.addEventListener("insert", (event) => {
    target = event.node;
    dispatch = dispatchCustomEvent.bind(null, {
      target,
      signal: handle.signal,
      namespace: "rmx:drag",
    });
  });

  return () => (
    <handle.element
      mix={[
        on("pointerdown", (event) => {
          if (!event.isPrimary) return;
          tracking = true;
          lastX = event.clientX;
          lastY = event.clientY;
          lastT = event.timeStamp;
          velocityX = 0;
          velocityY = 0;
          target?.setPointerCapture(event.pointerId);
        }),
        on("pointermove", (event) => {
          if (!tracking) return;
          let dt = Math.max(1, event.timeStamp - lastT);
          velocityX = (event.clientX - lastX) / dt;
          velocityY = (event.clientY - lastY) / dt;
          lastX = event.clientX;
          lastY = event.clientY;
          lastT = event.timeStamp;
        }),
        on("pointerup", () => {
          if (!tracking) return;
          tracking = false;
          dispatch({
            release: {
              velocityX,
              velocityY,
            },
          });
        }),
      ]}
    />
  );
});

function DraggableCard() {
  return () => (
    <div
      mix={[
        dragRelease(),
        on("rmx:drag:release", ({ detail }) => {
          console.log(
            "released with velocity:",
            detail.velocityX,
            detail.velocityY,
          );
        }),
      ]}
    />
  );
}
