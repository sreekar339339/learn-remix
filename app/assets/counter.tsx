import { clientEntry, on } from "remix/ui";
import { customEvents } from "./utils/customEvents/index.tsx";

export const Counter = clientEntry(import.meta.url, function Counter(handle) {
  let counterEvents = customEvents<{ count: number }>().withState({ count: 0 });
  let incrementOffset = 1;
  return () => (
    <>
      <button
        mix={[
          on("click", () => {
            counterEvents.update((state) => {
              state.count += incrementOffset;
            });
          }),
        ]}
      >
        <counterEvents.view.span>
          {() => counterEvents.count}
        </counterEvents.view.span>
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
