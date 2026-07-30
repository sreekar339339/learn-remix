import { clientEntry, css, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type Circle = {
  id: number;
  x: number;
  y: number;
  diameter: number;
};

type DrawingModel = {
  circles: Array<Circle>;
  editingCircleId: number | null;
  adjustmentUndo: Array<Circle> | null;
  diameterAdjusted: boolean;
  undo: Array<Array<Circle>>;
  redo: Array<Array<Circle>>;
  nextId: number;
};

function hitCircle(circles: Array<Circle>, x: number, y: number) {
  return (
    circles
      .map((circle) => ({
        circle,
        distance: Math.hypot(circle.x - x, circle.y - y),
      }))
      .filter(({ circle, distance }) => distance <= circle.diameter / 2)
      .sort((a, b) => a.distance - b.distance)[0]?.circle ?? null
  );
}

function cloneCircles(circles: Array<Circle>) {
  return circles.map((circle) => ({ ...circle }));
}

function recordHistory(model: DrawingModel) {
  model.undo.push(cloneCircles(model.circles));
  model.adjustmentUndo = null;
  model.redo.length = 0;
}

function getCanvasPoint(
  canvas: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  let rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return undefined;
  return {
    x: ((clientX - rect.left) / rect.width) * 420,
    y: ((clientY - rect.top) / rect.height) * 220,
  };
}

export const SevenGuisCircleDrawer = clientEntry(
  import.meta.url,
  function SevenGuisCircleDrawer(handle) {
    let events = customEvents<{
      editSessionSet: { circleId: number | null };
      circleResized: null;
    }>();
    let drawing: DrawingModel = {
      circles: [],
      editingCircleId: null,
      adjustmentUndo: null,
      diameterAdjusted: false,
      undo: [],
      redo: [],
      nextId: 1,
    };

    function editingCircle() {
      return drawing.circles.find(
        (circle) => circle.id === drawing.editingCircleId,
      );
    }

    return () => (
      <section mix={[taskCss, events.host()]}>
        <h2>Circle Drawer</h2>
        <div mix={rowCss}>
          <button
            type="button"
            disabled={!drawing.undo.length}
            mix={[
              buttonCss,
              on("click", () => {
                let circles = drawing.undo.at(-1);
                if (!circles) return;
                drawing.undo.pop();
                drawing.redo.unshift(cloneCircles(drawing.circles));
                drawing.circles.splice(
                  0,
                  drawing.circles.length,
                  ...cloneCircles(circles),
                );
                drawing.editingCircleId = null;
                drawing.adjustmentUndo = null;
                drawing.diameterAdjusted = false;
                handle.update();
              }),
            ]}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!drawing.redo.length}
            mix={[
              buttonCss,
              on("click", () => {
                let circles = drawing.redo[0];
                if (!circles) return;
                drawing.redo.shift();
                drawing.undo.push(cloneCircles(drawing.circles));
                drawing.circles.splice(
                  0,
                  drawing.circles.length,
                  ...cloneCircles(circles),
                );
                drawing.editingCircleId = null;
                drawing.adjustmentUndo = null;
                drawing.diameterAdjusted = false;
                handle.update();
              }),
            ]}
          >
            Redo
          </button>
        </div>
        <svg
          viewBox="0 0 420 220"
          aria-label="Circle canvas"
          mix={[
            css({
              width: "100%",
              height: 220,
              border: "1px solid #a1a1aa",
              backgroundColor: "white",
            }),
            on("click", ({ currentTarget, clientX, clientY }) => {
              if (drawing.editingCircleId !== null) return;
              let point = getCanvasPoint(currentTarget, clientX, clientY);
              if (!point || hitCircle(drawing.circles, point.x, point.y)) {
                return;
              }
              let circle = {
                id: drawing.nextId,
                ...point,
                diameter: 30,
              };
              recordHistory(drawing);
              drawing.circles.push(circle);
              drawing.nextId = circle.id + 1;
              handle.update();
            }),
          ]}
        >
          {drawing.circles.map((circle) => (
            <events.on.circleResized.circle
              key={circle.id}
              id={String(circle.id)}
              cx={circle.x}
              cy={circle.y}
              r={() => circle.diameter / 2}
              mix={[
                css({
                  pointerEvents: "all",
                  "&:hover": {
                    fill: "#d4d4d8",
                  },
                  stroke: "#18181b",
                  fill: "none",
                }),
                on("contextmenu", (event) => {
                  event.preventDefault();
                  if (drawing.editingCircleId === circle.id) return;
                  drawing.editingCircleId = circle.id;
                  drawing.adjustmentUndo = cloneCircles(drawing.circles);
                  drawing.diameterAdjusted = false;
                  event.currentTarget.dispatchEvent(
                    events("editSessionSet", { circleId: circle.id }),
                  );
                }),
              ]}
            />
          ))}
          <events.on.editSessionSet.g
            aria-hidden="true"
            child={() => {
              let circle = editingCircle();
              if (!circle) return null;
              return (
                <events.on.circleResized.circle
                  id={String(circle.id)}
                  cx={circle.x}
                  cy={circle.y}
                  r={() => circle.diameter / 2}
                  mix={css({
                    pointerEvents: "none",
                    stroke: "#18181b",
                    fill: "#d4d4d8",
                  })}
                />
              );
            }}
          />
        </svg>
        <events.on.editSessionSet.form
          hidden={() => drawing.editingCircleId === null}
          mix={[
            rowCss,
            on("submit", (event) => {
              event.preventDefault();
              if (drawing.editingCircleId === null) return;
              let adjustmentUndo = drawing.adjustmentUndo;
              if (adjustmentUndo !== null && drawing.diameterAdjusted) {
                drawing.undo.push(adjustmentUndo);
              }
              drawing.editingCircleId = null;
              drawing.adjustmentUndo = null;
              drawing.diameterAdjusted = false;
              drawing.redo.length = 0;
              event.currentTarget.dispatchEvent(
                events("editSessionSet", { circleId: null }),
              );
            }),
          ]}
        >
          <label>
            Diameter{" "}
            <events.on.editSessionSet.input
              type="range"
              min={10}
              max={120}
              defaultValue={() => editingCircle()?.diameter ?? 10}
              mix={[
                inputCss,
                on("input", ({ currentTarget }) => {
                  let circle = editingCircle();
                  if (!circle) return;
                  circle.diameter = currentTarget.valueAsNumber;
                  drawing.diameterAdjusted = true;
                  currentTarget.dispatchEvent(
                    events("circleResized", { key: circle.id }),
                  );
                }),
              ]}
            />
          </label>
          <button type="submit" mix={buttonCss}>
            Close
          </button>
        </events.on.editSessionSet.form>
      </section>
    );
  },
);
