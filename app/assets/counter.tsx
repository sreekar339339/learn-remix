import { clientEntry, on } from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

export const Counter = clientEntry(import.meta.url, function Counter(handle) {
  let counterEvents = new CustomEvents<{
    incrementOffset: number;
    count: number;
  }>();
  counterEvents.seed(counterEvents.change({ count: 0, incrementOffset: 1 }));
  return () => (
    <>
      <counterEvents.on.count
        render={({ detail }) => (
          <button
            mix={on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                counterEvents.count(
                  ({ incrementOffset }) =>
                    detail + (incrementOffset ?? 1),
                ),
              );
            })}
          >
            Counter: {detail}
          </button>
        )}
      />
      <label>
        Increment by{" "}
        <input
          mix={on("input", ({ currentTarget }) => {
            currentTarget.dispatchEvent(
              counterEvents.incrementOffset(currentTarget.valueAsNumber),
            );
          })}
          type='number'
          defaultValue={1}
        />
      </label>
    </>
  );
});
