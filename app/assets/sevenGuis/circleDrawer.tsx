import { clientEntry, css, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type Circle = {
  id: number;
  x: number;
  y: number;
  diameter: number;
};

type CircleHistory = {
  snapshots: Array<Map<number, Circle>>;
  index: number;
};

type DrawingModel = {
  circles: Map<number, Circle>;
  editingCircleId: number | null;
  history: CircleHistory;
};

function recordDrawingSnapshot(
  circles: Map<number, Circle>,
  history: CircleHistory,
) {
  history.snapshots.splice(history.index + 1);
  history.snapshots.push(
    new Map(circles.entries().map(([id, circle]) => [id, { ...circle }])),
  );
  history.index++;
}

function hitCircle(circles: Iterable<Circle>, x: number, y: number) {
  return (
    Iterator.from(circles)
      .map((circle) => ({
        circle,
        distance: Math.hypot(circle.x - x, circle.y - y),
      }))
      .filter(({ circle, distance }) => distance <= circle.diameter / 2)
      .reduce(
        (nearest, candidate) =>
          nearest === null || candidate.distance < nearest.distance
            ? candidate
            : nearest,
        null as { circle: Circle; distance: number } | null,
      )?.circle ?? null
  );
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
    let drawing = customEvents<DrawingModel>().withState(
      {
        circles: new Map(),
        editingCircleId: null,
        history: { snapshots: [new Map()], index: 0 },
      },
      { keyBy: { editingCircleId: "value" } },
    );
    let nextCircleId = 1;
    function addCircle(circle: Circle) {
      drawing.update((draft) => {
        draft.circles.set(circle.id, circle);
        recordDrawingSnapshot(draft.circles, draft.history);
      });
      void handle.update();
    }

    function closeDiameterEditor() {
      let id = drawing.editingCircleId;
      if (id === null) return;
      drawing.update((draft) => {
        let circle = draft.circles.get(id);
        let committedCircle =
          draft.history.snapshots[draft.history.index]?.get(id);
        if (circle?.diameter !== committedCircle?.diameter) {
          recordDrawingSnapshot(draft.circles, draft.history);
        }
        draft.editingCircleId = null;
      });
    }

    function travel(index: number) {
      drawing.update((draft) => {
        draft.circles = new Map(
          draft.history.snapshots[index]!.entries().map(([id, circle]) => [
            id,
            { ...circle },
          ]),
        );
        draft.editingCircleId = null;
        draft.history.index = index;
      });
      void handle.update();
    }

    return () => (
      <section mix={taskCss}>
        <h2>Circle Drawer</h2>
        <div mix={rowCss}>
          <drawing.events.button
            on={(event) => event.history}
            type="button"
            disabled={(event) => event.detail.index === 0}
            mix={[
              buttonCss,
              on("click", () => {
                if (drawing.history.index > 0) {
                  travel(drawing.history.index - 1);
                }
              }),
            ]}
          >
            Undo
          </drawing.events.button>
          <drawing.events.button
            on={(event) => event.history}
            type="button"
            disabled={(event) =>
              event.detail.index === event.detail.snapshots.length - 1
            }
            mix={[
              buttonCss,
              on("click", () => {
                if (
                  drawing.history.index <
                  drawing.history.snapshots.length - 1
                ) {
                  travel(drawing.history.index + 1);
                }
              }),
            ]}
          >
            Redo
          </drawing.events.button>
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
              if (
                !point ||
                hitCircle(drawing.circles.values(), point.x, point.y)
              ) {
                return;
              }
              let circle = {
                id: nextCircleId++,
                ...point,
                diameter: 30,
              };
              addCircle(circle);
            }),
          ]}
        >
          {[...drawing.circles.values()].map((circle) => (
            <drawing.events.circle
              on={(event) => [
                event.circles.get(circle.id).diameter,
                event.editingCircleId,
              ]}
              key={circle.id}
              id={String(circle.id)}
              cx={circle.x}
              cy={circle.y}
              r={() =>
                (drawing.circles.get(circle.id)?.diameter ?? circle.diameter) /
                2
              }
              fill={() =>
                drawing.editingCircleId === circle.id ? "#d4d4d8" : "none"
              }
              mix={[
                css({
                  pointerEvents: "all",
                  "&:hover": {
                    fill: "#d4d4d8",
                  },
                  stroke: "#18181b",
                }),
                on("contextmenu", (event) => {
                  event.preventDefault();
                  if (drawing.editingCircleId !== null) return;
                  drawing.update((draft) => {
                    draft.editingCircleId = circle.id;
                  });
                }),
              ]}
            />
          ))}
        </svg>
        <drawing.events.form
          on={(event) => event.editingCircleId}
          hidden={(event) => event.detail === null}
          mix={[
            rowCss,
            on("submit", (event) => {
              event.preventDefault();
              closeDiameterEditor();
            }),
          ]}
        >
          <label>
            Diameter{" "}
            <drawing.events.input
              on={(event) => [event.editingCircleId, event.circles]}
              type="range"
              min={10}
              max={120}
              defaultValue={() =>
                drawing.editingCircleId === null
                  ? 10
                  : (drawing.circles.get(drawing.editingCircleId)?.diameter ??
                    10)
              }
              mix={[
                inputCss,
                on("input", ({ currentTarget }) => {
                  let id = drawing.editingCircleId;
                  if (id === null) return;
                  let diameter = currentTarget.valueAsNumber;
                  if (drawing.circles.get(id)?.diameter === diameter) return;
                  drawing.update((draft) => {
                    let circle = draft.circles.get(id);
                    if (circle) circle.diameter = diameter;
                  });
                }),
              ]}
            />
          </label>
          <button type="submit" mix={buttonCss}>
            Close
          </button>
        </drawing.events.form>
      </section>
    );
  },
);
