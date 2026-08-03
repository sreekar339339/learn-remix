import { clientEntry, on, ref } from "remix/ui";
import { customEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type TimerModel = {
  elapsed: number;
  duration: number;
};
export const SevenGuisTimer = clientEntry(
  import.meta.url,
  function SevenGuisTimer() {
    let timer = customEvents<TimerModel>().withState({
      elapsed: 0,
      duration: 10,
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
              timer.update((draft) => {
                if (draft.elapsed >= draft.duration) return;
                draft.elapsed = Math.min(draft.duration, draft.elapsed + delta);
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
            value={({ detail }) =>
              Math.min(1, detail.elapsed / detail.duration)
            }
            max={1}
          />
          <timer.view.output on={timer.events.elapsed}>
            {({ detail }) => `${detail.toFixed(1)}s elapsed`}
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
                  draft.duration = duration;
                  draft.elapsed = Math.min(draft.elapsed, duration);
                });
              }),
            ]}
          />
          <timer.view.span on={timer.events.duration}>
            {({ detail }) => `${detail.toFixed(1)}s`}
          </timer.view.span>
        </label>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", () => {
              timer.update((draft) => {
                draft.elapsed = 0;
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
