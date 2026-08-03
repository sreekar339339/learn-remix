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
      selectedId: string | null;
    }>().withState({
      selectedId: items[0]!.id,
    });
    let renderCounts = new Map<string, number>();

    return () => (
      <section mix={taskCss}>
        <h2>Keyed selection</h2>
        <p>
          Selecting an item changes its identity, so only the losing and gaining
          option re-render.
        </p>
        <div mix={rowCss}>
          {items.map((item) => (
            <selection.view.button
              on={selection.events.selectedId.as(item.id)}
              key={item.id}
              aria-label={item.label}
              type="button"
              aria-pressed={({ detail }) => detail}
              data-renders={() => {
                let count = (renderCounts.get(item.id) ?? 0) + 1;
                renderCounts.set(item.id, count);
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
            </selection.view.button>
          ))}
        </div>
        <p>
          Selected:{" "}
          <selection.view.output on={selection.events.selectedId}>
            {(event) => event.detail}
          </selection.view.output>
        </p>
      </section>
    );
  },
);
