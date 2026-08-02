import { clientEntry, css, on } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, rowCss, taskCss } from "./styles.ts";

const items = [
  { id: "alpha", label: "Alpha" },
  { id: "bravo", label: "Bravo" },
  { id: "charlie", label: "Charlie" },
];

export const KeyedSelection = clientEntry(
  import.meta.url,
  function KeyedSelection() {
    let selection = customEvents<{
      selectedId: string;
    }>().withState(
      { selectedId: items[0]!.id },
      {
        keyBy: { selectedId: "value" },
      },
    );
    let projectionCounts = new Map<string, number>();

    return () => (
      <section mix={taskCss}>
        <h2>Keyed selection</h2>
        <p>
          Selecting an item updates only the item losing selection and the item
          gaining it.
        </p>
        <div mix={rowCss}>
          {items.map((item) => (
            <selection.events.button
              on={(event) => event.selectedId}
              key={item.id}
              id={item.id}
              type="button"
              aria-pressed={(event) => event.detail === item.id}
              data-projections={() => {
                let count = (projectionCounts.get(item.id) ?? 0) + 1;
                projectionCounts.set(item.id, count);
                return count;
              }}
              mix={[
                buttonCss,
                css({
                  "&[aria-pressed='true']": {
                    color: "white",
                    backgroundColor: "#2563eb",
                  },
                }),
                on("click", () => {
                  selection.update((draft) => {
                    draft.selectedId = item.id;
                  });
                }),
              ]}
            >
              {item.label}
            </selection.events.button>
          ))}
        </div>
        <p>
          Selected:{" "}
          <selection.events.output on={(event) => event.selectedId}>
            {(event) => event.detail}
          </selection.events.output>
        </p>
      </section>
    );
  },
);
