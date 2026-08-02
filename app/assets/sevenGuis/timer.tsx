import { clientEntry, on, ref } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type TimerModel = {
  timing: {
    elapsed: number;
    duration: number;
  };
};
export const SevenGuisTimer = clientEntry(
  import.meta.url,
  function SevenGuisTimer() {
    let timer = customEvents<TimerModel>().withState({
      timing: {
        elapsed: 0,
        duration: 10,
      },
    });
    return () => (
      <section
        mix={[
          taskCss,
          ref((_, signal) => {
            let last = performance.now();
            let id = window.setInterval(() => {
              let now = performance.now();
              let delta = (now - last) / 1000;
              last = now;
              if (timer.timing.elapsed >= timer.timing.duration) return;
              timer.update((draft) => {
                draft.timing.elapsed = Math.min(
                  draft.timing.duration,
                  draft.timing.elapsed + delta,
                );
              });
            }, 100);
            signal.addEventListener("abort", () => window.clearInterval(id), {
              once: true,
            });
          }),
        ]}
      >
        <h2>Timer</h2>
        <div>
          <timer.view.progress
            on={timer.events.timing}
            value={({ detail }) =>
              Math.min(1, detail.elapsed / detail.duration)}
            max={1}
          />
          <timer.view.output on={timer.events.timing.elapsed}>
            {(event) => `${event.detail.toFixed(1)}s elapsed`}
          </timer.view.output>
        </div>
        <label mix={rowCss}>
          Duration
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            defaultValue={10}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                let duration = currentTarget.valueAsNumber;
                timer.update((draft) => {
                  draft.timing.duration = duration;
                  draft.timing.elapsed = Math.min(
                    draft.timing.elapsed,
                    duration,
                  );
                });
              }),
            ]}
          />
          <timer.view.span on={timer.events.timing.duration}>
            {(event) => `${event.detail.toFixed(1)}s`}
          </timer.view.span>
        </label>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", () => {
              timer.update((draft) => {
                draft.timing.elapsed = 0;
              });
            }),
          ]}
        >
          Reset
        </button>
      </section>
    );
  },
);
