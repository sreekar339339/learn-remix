import { createMixin, on } from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";

type DragReleaseEventMap = CustomEventMap<
  {
    release: { velocityX: number; velocityY: number };
  },
  "drag"
>;

type DragRelaseEventTypes = DragReleaseEventMap["types"];

declare global {
  interface HTMLElementEventMap extends DragRelaseEventTypes {}
}

export let dragRelease = createMixin<HTMLElement>((handle) => {
  let node: DragReleaseEventMap["target"]["htmlElement"] | undefined;
  let tracking = false;
  let velocityX = 0;
  let velocityY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  handle.addEventListener("insert", (event) => {
    node = event.node;
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
          node?.setPointerCapture(event.pointerId);
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
        on("pointerup", (evt, signal) => {
          if (!tracking) return;
          tracking = false;
          dispatchCustomEvent(node!, signal, "drag:release", {
            velocityX,
            velocityY,
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
        on('drag:release', ({detail}) => {
          console.log('released with velocity:', detail.velocityX, detail.velocityY)
        }),
      ]}
    />
  )
}

