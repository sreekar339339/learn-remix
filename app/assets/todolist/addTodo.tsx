import {
  addEventListeners,
  clientEntry,
  css,
  on,
  ref,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { routes } from "../../routes.ts";
import { RequestEventTarget } from "../utils/RequestEventTarget.js";

export const AddTodo = clientEntry(
  import.meta.url,
  function AddTodo(handle: Handle) {
    let input: HTMLInputElement;
    let form: HTMLFormElement;

    let actionEventTarget = new RequestEventTarget();

    let submit = async (
      evt: Dispatched<SubmitEvent, HTMLFormElement>,
      signal: AbortSignal,
    ) => {
      evt.preventDefault();
      form = evt.currentTarget;
      if (!input.value) return void actionEventTarget.dispatchEvent("idle");
      const formAction = new URL(form.action);
      formAction.searchParams.set("redirectTo", "none");
      actionEventTarget.dispatchEvent("requestSubmitted");
      try {
        let resp = await fetch(formAction, {
          method: "POST",
          body: new FormData(form),
          signal,
        });
        if (!resp.ok) new Error(resp.statusText, { cause: resp.status });
        if (signal.aborted) return;
        await handle.frames.top.reload()
        actionEventTarget.dispatchEvent("requestSucceeded", {});
      } catch (error) {
        console.log({error})
        if (signal.aborted) return;
        actionEventTarget.dispatchEvent("requestErrored", {
          error: error as Error,
        });
      }
    };

    return () => (
      <>
        <form
          method="POST"
          action={routes.todolist.todos.action.href(undefined, {
            intent: "create",
          })}
          mix={[on("submit", submit)]}
        >
          <label mix={css({ display: "flex", alignItems: "center", gap: 8 })}>
            Enter a todo{" "}
            <input
              mix={[css({ padding: 4 }), ref((node) => (input = node))]}
              name="text"
              autofocus
            />
          </label>
        </form>
      </>
    );
  },
);
