import { clientEntry, on } from "remix/ui";
import { CustomEvents } from "./utils/customEvents/index.tsx";

export const Counter = clientEntry(import.meta.url, function Counter(handle) {
  let events = new CustomEvents<"countIncremented">();
  let count = 0,
    incrementOffset = 1;
  return () => (
    <>
      <button
        mix={on("click", ({ currentTarget }) => {
          count = count + incrementOffset;
          currentTarget.dispatchEvent(events("countIncremented"));
        })}
      >
        <events.on.countIncremented render={() => count} />
      </button>
      <label>
        Increment by{" "}
        <input
          mix={on("input", ({ currentTarget }) => {
            incrementOffset = currentTarget.valueAsNumber;
          })}
          type="number"
          defaultValue={incrementOffset}
        />
      </label>
    </>
  );
});
