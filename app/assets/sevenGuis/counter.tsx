import { clientEntry, on } from "remix/ui";
import { CustomEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, taskCss } from "./styles.ts";

export const SevenGuisCounter = clientEntry(
  import.meta.url,
  function SevenGuisCounter() {
    let events = new CustomEvents<"countIncremented">();
    let count = 0;
    return () => (
      <section mix={taskCss}>
        <h2>Counter</h2>
        <output aria-label="count">
          <events.on.countIncremented.span child={() => count} />
        </output>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", ({ currentTarget }) => {
              count += 1;
              currentTarget.dispatchEvent(events("countIncremented"));
            }),
          ]}
        >
          Count
        </button>
      </section>
    );
  },
);
