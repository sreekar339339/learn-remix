import { clientEntry, css, on } from "remix/ui";
import { CustomEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type Circle = {
  id: number;
  x: number;
  y: number;
  diameter: number;
};

type DrawingModel = {
  circles: Array<Circle>;
  selectedId: number | null;
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
  function SevenGuisCircleDrawer() {
    let events = new CustomEvents<
      "canvasUpdated" | "historyUpdated" | "diameterEditorUpdated"
    >();
    let drawing: DrawingModel = {
      circles: [],
      selectedId: null,
      editingCircleId: null,
      adjustmentUndo: null,
      diameterAdjusted: false,
      undo: [],
      redo: [],
      nextId: 1,
    };
    return () => (
      <section mix={taskCss}>
        <h2>Circle Drawer</h2>
        <events.on.historyUpdated.div
          mix={rowCss}
          child={() => (
            <>
              <button
                type="button"
                disabled={!drawing.undo.length}
                mix={[
                  buttonCss,
                  on("click", ({ currentTarget }) => {
                    let circles = drawing.undo.at(-1);
                    if (!circles) return;
                    drawing.undo.pop();
                    drawing.redo.unshift(cloneCircles(drawing.circles));
                    drawing.circles.splice(
                      0,
                      drawing.circles.length,
                      ...cloneCircles(circles),
                    );
                    drawing.selectedId = null;
                    drawing.editingCircleId = null;
                    drawing.adjustmentUndo = null;
                    drawing.diameterAdjusted = false;
                    currentTarget.dispatchEvent(
                      events([
                        "canvasUpdated",
                        "historyUpdated",
                        "diameterEditorUpdated",
                      ]),
                    );
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
                  on("click", ({ currentTarget }) => {
                    let circles = drawing.redo[0];
                    if (!circles) return;
                    drawing.redo.shift();
                    drawing.undo.push(cloneCircles(drawing.circles));
                    drawing.circles.splice(
                      0,
                      drawing.circles.length,
                      ...cloneCircles(circles),
                    );
                    drawing.selectedId = null;
                    drawing.editingCircleId = null;
                    drawing.adjustmentUndo = null;
                    drawing.diameterAdjusted = false;
                    currentTarget.dispatchEvent(
                      events([
                        "canvasUpdated",
                        "historyUpdated",
                        "diameterEditorUpdated",
                      ]),
                    );
                  }),
                ]}
              >
                Redo
              </button>
            </>
          )}
        />
        <events.on.canvasUpdated.svg
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
              currentTarget.dispatchEvent(
                events(["canvasUpdated", "historyUpdated"]),
              );
            }),
            on("mousemove", ({ currentTarget, clientX, clientY }) => {
              if (drawing.editingCircleId !== null) return;
              let point = getCanvasPoint(currentTarget, clientX, clientY);
              if (!point) return;
              let selectedId =
                hitCircle(drawing.circles, point.x, point.y)?.id ?? null;
              if (selectedId === drawing.selectedId) return;
              drawing.selectedId = selectedId;
              currentTarget.dispatchEvent(events("canvasUpdated"));
            }),
          ]}
          child={() => (
            <>
              {drawing.circles.map((circle) => (
                <circle
                  cx={circle.x}
                  cy={circle.y}
                  r={circle.diameter / 2}
                  fill={circle.id === drawing.selectedId ? "#d4d4d8" : "none"}
                  stroke="#18181b"
                  mix={on("contextmenu", (event) => {
                    event.preventDefault();
                    drawing.selectedId = circle.id;
                    drawing.editingCircleId = circle.id;
                    drawing.adjustmentUndo = cloneCircles(drawing.circles);
                    drawing.diameterAdjusted = false;
                    event.currentTarget.dispatchEvent(
                      events(["canvasUpdated", "diameterEditorUpdated"]),
                    );
                  })}
                />
              ))}
            </>
          )}
        />
        <events.on.diameterEditorUpdated.form
          hidden={() => drawing.editingCircleId === null}
          mix={[
            rowCss,
            on("submit", (event) => {
              event.preventDefault();
              if (drawing.editingCircleId === null) return;
              if (drawing.adjustmentUndo && drawing.diameterAdjusted) {
                drawing.undo.push(drawing.adjustmentUndo);
              }
              drawing.editingCircleId = null;
              drawing.adjustmentUndo = null;
              drawing.diameterAdjusted = false;
              drawing.redo.length = 0;
              event.currentTarget.dispatchEvent(
                events(["historyUpdated", "diameterEditorUpdated"]),
              );
            }),
          ]}
          child={() => (
            <>
              <label>
                Diameter{" "}
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={
                    drawing.circles.find(
                      (circle) => circle.id === drawing.editingCircleId,
                    )?.diameter
                  }
                  mix={[
                    inputCss,
                    on("input", ({ currentTarget }) => {
                      let circle = drawing.circles.find(
                        (circle) => circle.id === drawing.editingCircleId,
                      );
                      if (!circle) return;
                      circle.diameter = currentTarget.valueAsNumber;
                      drawing.diameterAdjusted = true;
                      currentTarget.dispatchEvent(
                        events([
                          "canvasUpdated",
                          "diameterEditorUpdated",
                        ]),
                      );
                    }),
                  ]}
                />
              </label>
              <button type="submit" mix={buttonCss}>
                Close
              </button>
            </>
          )}
        />
      </section>
    );
  },
);
