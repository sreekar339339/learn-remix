import {
  addEventListeners,
  css,
  ref,
  TypedEventTarget,
  type Handle,
  type Props,
  type RefCallback,
} from "remix/ui";
import { routes } from "../../routes.ts";
import type { TodoActionEventMap } from "./todoList.tsx";
import { getInput } from "../utils/dom.ts";
import { dispatchCustomEvent } from "../utils/customEvent.ts";
import { match, P } from "ts-pattern";

export function AddTodo(handle: Handle<Props<"form">>) {
  let actionTarget = new TypedEventTarget<TodoActionEventMap>();
  addEventListeners(actionTarget, handle.signal, {
    change({detail}) {
      if ('changes' in detail) return
      let input = detail.detail ? getInput(detail.detail.form) : null
      if (detail.type === 'actionSubmitted') {
        input?.select();
        input?.classList.add("pending");
        input!.disabled = true
        return
      }
      input?.classList.remove("pending");
      input!.disabled = false
      if (detail.type === 'actionSucceeded') {
        detail.detail.form.reset();
      }
    }
  });
  let formRef: RefCallback<HTMLFormElement> = (form, signal) => {
    addEventListeners(form, signal, {
      async submit(evt, signal) {
        evt.preventDefault();
        let dispatch = dispatchCustomEvent(actionTarget, signal);
        let form = evt.currentTarget;
        let formData = new FormData(form, evt.submitter);
        if (formData.get("text") === "") return void dispatch("idle");
        let formAction = new URL(form.action);
        formData.set("redirectTo", "none");
        try {
          dispatch("actionSubmitted", { form });
          // await new Promise((res, rej) => setTimeout(rej, 2000, new Error('laude lag gaye')));
          let resp = await fetch(formAction, {
            method: "POST",
            body: formData,
            signal,
          });
          if (!resp.ok) {
            throw new Error(`${resp.status} ${resp.statusText}`, {
              cause: await resp.text(),
            });
          }
          await handle.frames.get("TodoItems")?.reload();
          dispatch("actionSucceeded", { form });
        } catch (error) {
          dispatch("actionErrored", { error: error as Error, form });
        }
      },
    });
  };

  return () => (
    <form
      method="POST"
      action={routes.todolist.todos.action.href()}
      mix={[ref(formRef)]}
    >
      <button hidden name="intent" value="create"></button>
      <label mix={css({ display: "flex", alignItems: "center", gap: 8 })}>
        Enter a todo{" "}
        <input
          mix={[
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
          autofocus
        />
      </label>
    </form>
  );
}
