import { addEventListeners, css, ref, type Handle, type Props } from "remix/ui";
import { routes } from "../../routes.ts";
import type { TodoActionEventMap } from "./todoList.tsx";
import { getInput } from "../utils/dom.ts";
import { dispatchCustomEvent } from "../utils/customEvent.ts";

export function AddTodo(handle: Handle<Props<"form">>) {
  let actionEventTargetRef = (target: TodoActionEventMap["target"]["form"]) => {
    let dispatch = dispatchCustomEvent(target);
    addEventListeners(target, handle.signal, {
      async "todo:actionSucceeded"({ detail }) {
        detail.form.reset();
      },
      "todo:actionSubmitted"({ detail }) {
        getInput(detail.form)?.select();
      },
      async submit(evt, signal) {
        evt.preventDefault();
        let form = evt.currentTarget;
        let input = getInput(form);
        if (!input?.value)
          return void dispatch("todo:idle", signal);
        const formAction = new URL(form.action);
        let formData = new FormData(form, evt.submitter);
        formData.set("redirectTo", "none");
        try {
          dispatch("todo:actionSubmitted", { form }, signal);
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
          dispatch("todo:actionSucceeded", { form }, signal);
        } catch (error) {
          dispatch(
            "todo:actionErrored",
            { error: error as Error },
            signal,
          );
        }
      },
    });
  };

  return () => (
    <form
      method="POST"
      action={routes.todolist.todos.action.href()}
      mix={[ref(actionEventTargetRef)]}
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
