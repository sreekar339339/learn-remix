import {
  addEventListeners,
  css,
  on,
  ref,
  type Dispatched,
  type Handle,
  type Props,
} from "remix/ui";
import { routes } from "../../routes.ts";
import { actionTarget } from "./todoList.tsx";
import { dispatchCustomEvent } from "../utils/customEvent.ts";
import { onTarget } from "../utils/onTarget.ts";

export function AddTodo(handle: Handle<Props<"form">>) {
  let onSubmit = async (
    evt: Dispatched<SubmitEvent, HTMLFormElement>,
    signal: AbortSignal,
  ) => {
    evt.preventDefault();
    let form = evt.currentTarget;
    let submitter = evt.submitter as HTMLButtonElement;
    let formData = new FormData(form, submitter);
    if (formData.get("text") === "") return;
    formData.set("redirectTo", "none");
    let dispatch = dispatchCustomEvent.bind(null, {
      target: actionTarget,
      signal,
      source: form,
    });
    try {
      dispatch({ actionSubmitted: null });
      // await new Promise((res, rej) => setTimeout(rej, 2000, new Error('laude lag gaye')));
      let resp = await fetch(new URL(form.action), {
        method: "POST",
        body: formData,
        signal,
      });
      if (!resp.ok) {
        throw new Error(`${resp.status} ${resp.statusText}`, {
          cause: await resp.text(),
        });
      }
      await handle.frames.get("TodoItems")!.reload();
      dispatch({ actionSucceeded: null });
    } catch (error) {
      dispatch({ actionErrored: { error: error as Error } });
    }
  };

  return () => (
    <form
      method="POST"
      action={routes.todolist.todos.action.href()}
      mix={[
        on("submit", onSubmit),
        onTarget(actionTarget, "actionSucceeded", (event, form) => {
          if (event.source !== form) return;
          form.reset();
        }),
      ]}
    >
      <button hidden name="intent" value="create"></button>
      <label mix={css({ display: "flex", alignItems: "center", gap: 8 })}>
        Enter a todo{" "}
        <input
          mix={[
            onTarget(actionTarget, 'change', (event, input) => {
              if (event.source !== input.form) return;
              let isActionSubmitted = event.detail.type === 'actionSubmitted'
              input.classList.toggle('pending', isActionSubmitted)
              input.toggleAttribute('disabled', isActionSubmitted)
              input.select()
            }),
            css({
              padding: 4,
              font: "inherit",
              color: "inherit",
              "&.pending": {
                color: "var(--text-primary)",
                backgroundColor: "var(--surface-4)",
                backgroundImage:
                  "linear-gradient(100deg, transparent 0%, transparent 35%, rgba(45, 172, 249, 0.28) 50%, transparent 65%, transparent 100%)",
                backgroundSize: "220% 100%",
                animation: "glimmer 1.15s linear infinite",
                borderColor: "var(--brand-blue)",
              },
              "@media (prefers-reduced-motion: reduce)": {
                "&.pending": {
                  animation: "none",
                },
              },
            }),
          ]}
          name="text"
        />
      </label>
    </form>
  );
}
