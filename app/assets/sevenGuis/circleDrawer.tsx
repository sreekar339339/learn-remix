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
  snapshots: Array<Array<Circle>>;
  index: number;
};

type DrawingModel = {
  circles: Array<Circle>;
  draftCircle: Circle | null;
  history: CircleHistory;
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
    let drawing = customEvents<DrawingModel>().withState({
      circles: [],
      draftCircle: null,
      history: { snapshots: [[]], index: 0 },
    });
    let nextCircleId = 1;

    function circleWithId(id: number | null) {
      return drawing.circles.find((circle) => circle.id === id);
    }

    function commitCircleState(
      circles: Array<Circle>,
      value: Partial<DrawingModel> = {},
      key?: number,
    ) {
      let { snapshots, index } = drawing.history;
      drawing.patch(
        {
          ...value,
          circles,
          history: {
            snapshots: [...snapshots.slice(0, index + 1), circles],
            index: index + 1,
          },
        },
        key === undefined ? undefined : { key },
      );
      if (key === undefined) void handle.update();
    }

    function travel(index: number) {
      drawing.patch({
        circles: drawing.history.snapshots[index],
        draftCircle: null,
        history: { ...drawing.history, index },
      });
      void handle.update();
    }

    return () => (
      <section mix={taskCss}>
        <h2>Circle Drawer</h2>
        <div mix={rowCss}>
          <button
            type="button"
            disabled={drawing.history.index === 0}
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
          </button>
          <button
            type="button"
            disabled={
              drawing.history.index === drawing.history.snapshots.length - 1}
            mix={[
              buttonCss,
              on("click", () => {
                if (
                  drawing.history.index < drawing.history.snapshots.length - 1
                ) {
                  travel(drawing.history.index + 1);
                }
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
              if (drawing.draftCircle !== null) return;
              let point = getCanvasPoint(currentTarget, clientX, clientY);
              if (!point || hitCircle(drawing.circles, point.x, point.y)) {
                return;
              }
              let circle = {
                id: nextCircleId++,
                ...point,
                diameter: 30,
              };
              commitCircleState([...drawing.circles, circle]);
            }),
          ]}
        >
          {drawing.circles.map((circle) => (
            <drawing.events.on.draftCircle.circle
              key={circle.id}
              id={String(circle.id)}
              cx={circle.x}
              cy={circle.y}
              r={() =>
                (drawing.draftCircle?.id === circle.id
                  ? drawing.draftCircle
                  : circleWithId(circle.id))!.diameter / 2}
              fill={() =>
                drawing.draftCircle?.id === circle.id ? "#d4d4d8" : "none"}
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
                  if (drawing.draftCircle !== null) return;
                  drawing.patch(
                    { draftCircle: { ...circle } },
                    { key: circle.id },
                  );
                }),
              ]}
            />
          ))}
        </svg>
        <drawing.events.on.draftCircle.form
          hidden={() => drawing.draftCircle === null}
          mix={[
            rowCss,
            on("submit", (event) => {
              event.preventDefault();
              let draft = drawing.draftCircle;
              if (draft === null) return;
              let circle = circleWithId(draft.id);
              if (circle && circle.diameter !== draft.diameter) {
                commitCircleState(
                  drawing.circles.map((item) =>
                    item.id === draft.id ? draft : item
                  ),
                  { draftCircle: null },
                  draft.id,
                );
              } else {
                drawing.patch({ draftCircle: null }, { key: draft.id });
              }
            }),
          ]}
        >
          <label>
            Diameter{" "}
            <drawing.events.on.draftCircle.input
              type="range"
              min={10}
              max={120}
              defaultValue={() => drawing.draftCircle?.diameter ?? 10}
              mix={[
                inputCss,
                on("input", ({ currentTarget }) => {
                  let circle = drawing.draftCircle;
                  if (circle === null) return;
                  let diameter = currentTarget.valueAsNumber;
                  if (circle.diameter === diameter) return;
                  drawing.patch(
                    { draftCircle: { ...circle, diameter } },
                    { key: circle.id },
                  );
                }),
              ]}
            />
          </label>
          <button type="submit" mix={buttonCss}>
            Close
          </button>
        </drawing.events.on.draftCircle.form>
      </section>
    );
  },
);
