import { addEventListeners, css, type Handle, type Props } from "remix/ui";
import { routes } from "../../routes.ts";
import { customEvents } from "../utils/customEventMixin.ts";
import type { TodoActionEventMap } from "./todoList.tsx";
import { getInput } from "../utils/dom.ts";

export function AddTodo(handle: Handle<Props<"form">>) {
  const eventsMix = customEvents<TodoActionEventMap, HTMLFormElement>(
    ({ target, dispatchCustomEvent }) => {
      addEventListeners(target, handle.signal, {
        async "myapp:todo:actionSucceeded"({ detail }) {
          detail.form.reset();
        },
        "myapp:todo:actionSubmitted"({ detail }) {
          getInput(detail.form)?.select();
        },
        async submit(evt, signal) {
          evt.preventDefault();
          let form = evt.currentTarget;
          let input = getInput(form);
          if (!input?.value)
            return void dispatchCustomEvent("myapp:todo:idle", signal);
          const formAction = new URL(form.action);
          let formData = new FormData(form, evt.submitter);
          formData.set("redirectTo", "none");
          try {
            dispatchCustomEvent(
              "myapp:todo:actionSubmitted",
              { form },
              signal,
            );
            // await new Promise((res) => setTimeout(res, 2000));
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
            // await new Promise((res, rej) => setTimeout(rej, 2000, new Error('laude lag gaye')));
            // await handle.frame.reload();
            await handle.frames.get("TodoItems")?.reload();
            dispatchCustomEvent(
              "myapp:todo:actionSucceeded",
              { form },
              signal,
            );
          } catch (error) {
            dispatchCustomEvent(
              "myapp:todo:actionErrored",
              { error: error as Error },
              signal,
            );
          }
        },
      });
    },
  );

  return () => (
    <form
      method="POST"
      action={routes.todolist.todos.action.href()}
      mix={[eventsMix]}
    >
      <button hidden name="intent" value="create"></button>
      <label mix={css({ display: "flex", alignItems: "center", gap: 8 })}>
        Enter a todo{" "}
        <input
          mix={[css({ padding: 4, font: "inherit", color: "inherit" })]}
          name="text"
          autofocus
        />
      </label>
    </form>
  );
}
