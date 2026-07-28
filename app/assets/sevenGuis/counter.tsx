import { clientEntry, on } from "remix/ui";
import { buttonCss, taskCss } from "./styles.ts";

export const SevenGuisCounter = clientEntry(
  import.meta.url,
  function SevenGuisCounter(handle) {
    let count = 0;
    return () => (
      <section mix={taskCss}>
        <h2>Counter</h2>
        <output aria-label="count">
          <span>{count}</span>
        </output>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", () => {
              count += 1;
              handle.update();
            }),
          ]}
        >
          Count
        </button>
      </section>
    );
  },
);
