import { createMixin, on } from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
  type DispatchCustomEvent,
  type Namespaced,
} from "./utils/customEvent.ts";

type DragDetail = {
  left: number;
  top: number;
};

type DraggableEventMap = CustomEventMap<{
  start: DragDetail;
  end: DragDetail;
}>;

type DraggableNamespace = "rmx:drag";

declare global {
  interface HTMLElementEventMap extends Namespaced<
    DraggableEventMap,
    DraggableNamespace
  > {}
}
type DraggableProps = {
  on?: Record<string, (event: Event) => void>;
};

const baseDraggable = createMixin<HTMLElement, [boolean], DraggableProps>(
  (handle) => {
    let target: HTMLElement | null = null;
    let enabled = true;
    let pointerId: number | null = null;
    let startLeft = 0;
    let startTop = 0;
    let startClientX = 0;
    let startClientY = 0;
    let dispatch: DispatchCustomEvent<HTMLElement, DraggableNamespace>;

    handle.addEventListener("insert", (event) => {
      target = event.node;
      dispatch = dispatchCustomEvent.bind(null, {
        target,
        signal: handle.signal,
        namespace: "rmx:drag",
      });
    });

    handle.addEventListener("remove", stopDrag);

    return (nextEnabled: boolean = true, props) => {
      enabled = nextEnabled;
      if (!enabled) {
        stopDrag();
      }

      return (
        <handle.element
          {...props}
          mix={[on("pointerdown", (event) => onPointerDown(event))]}
        />
      );
    };

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      if (!enabled) return;
      if (!target) return;

      let style = getComputedStyle(target);
      if (style.position === "static") {
        target.style.position = "relative";
      }
      target.style.cursor = "grabbing";

      startLeft = readPx(target.style.left);
      startTop = readPx(target.style.top);
      startClientX = event.clientX;
      startClientY = event.clientY;
      pointerId = event.pointerId;

      try {
        target.setPointerCapture(event.pointerId);
      } catch {}

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerDone);
      window.addEventListener("pointercancel", onPointerDone);
      dispatch({
        start: {
          left: startLeft,
          top: startTop,
        },
      });
    }

    function onPointerMove(event: PointerEvent) {
      if (!target) return;
      if (pointerId == null) return;
      if (event.pointerId !== pointerId) return;
      let dx = event.clientX - startClientX;
      let dy = event.clientY - startClientY;
      target.style.left = `${startLeft + dx}px`;
      target.style.top = `${startTop + dy}px`;
      void handle.update();
    }

    function onPointerDone(event: PointerEvent) {
      if (!target) return;
      if (pointerId == null) return;
      if (event.pointerId !== pointerId) return;
      stopDrag();
      dispatch({
        end: {
          left: readPx(target.style.left),
          top: readPx(target.style.top),
        },
      });
    }

    function stopDrag() {
      if (!target) return;
      if (pointerId == null) return;
      pointerId = null;
      target.style.cursor = "grab";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerDone);
      window.removeEventListener("pointercancel", onPointerDone);
    }
  },
);

function readPx(value: string) {
  if (!value) return 0;
  let parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

let draggableEventTypes: {
  [K in Exclude<
    keyof DraggableEventMap,
    "change"
  >]: `${DraggableNamespace}:${K}`;
} = {
  start: "rmx:drag:start",
  end: "rmx:drag:end",
};

type DraggableMixin = typeof baseDraggable & typeof draggableEventTypes;

export const draggable: DraggableMixin = Object.assign(
  baseDraggable,
  draggableEventTypes,
);

function DraggableCard() {
  return () => (
    <div
      mix={[
        draggable(true),
        on(draggable.start, ({ detail: { left, top } }) => {
          console.log("draggable start with:", { left }, { top });
        }),
        on(draggable.end, ({ detail: { left, top } }) => {
          console.log("draggable end with:", { left }, { top });
        }),
      ]}
    />
  );
}
