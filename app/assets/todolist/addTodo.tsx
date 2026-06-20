import {
  addEventListeners,
  attrs,
  clientEntry,
  css,
  on,
  ref,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { routes } from "../../routes.ts";
import { Glyph } from "remix/ui/glyph";
import { TodoList } from "./todoList.tsx";

type ActionEvent =
  | { type: "initiated" }
  | { type: "errored"; error: Error }
  | { type: "succeeded" }
  | { type: "idle" };

export const AddTodo = clientEntry(
  import.meta.url,
  function AddTodo(handle: Handle<{}>) {
    let input: HTMLInputElement;
    let form: HTMLFormElement;
    let actionEventTarget = handle.context.get(TodoList);

    addEventListeners(actionEventTarget, handle.signal, {
      async change(evt) {
        if (evt.context === "addTodo") {
          if (evt.type === "succeeded") form.reset();
          if (evt.type === "initiated") input.select();
        }
      },
    });

    let submit = async (
      evt: Dispatched<SubmitEvent, HTMLFormElement>,
      signal: AbortSignal,
    ) => {
      evt.preventDefault();
      form = evt.currentTarget;
      if (!input.value)
        return void actionEventTarget.dispatchEvent({
          type: "idle",
          context: "addTodo",
        });
      const formAction = new URL(form.action);
      formAction.searchParams.set("redirectTo", "none");
      actionEventTarget.dispatchEvent({
        type: "initiated",
        context: "addTodo",
      });
      try {
        let resp = await fetch(formAction, {
          method: "POST",
          body: new FormData(form),
          signal,
        });
        if (!resp.ok) new Error(resp.statusText, { cause: resp.status });
        if (signal.aborted) return;
        await handle.frames.get("todoItems")?.reload();
        actionEventTarget.dispatchEvent({
          type: "succeeded",
          context: "addTodo",
        });
      } catch (error) {
        if (signal.aborted) return;
        actionEventTarget.dispatchEvent({
          type: "errored",
          error: error as Error,
          context: "addTodo",
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
            <Spinner />
          </label>
        </form>
      </>
    );
  },
);

function Spinner(handle: Handle) {
  let actionEventTarget = handle.context.get(TodoList);
  let actionEvent: ActionEvent = {type: 'idle'};
  addEventListeners(actionEventTarget, handle.signal, {
    async change(evt) {
      actionEvent = evt;
      await handle.update();
    },
  });

  return () => (
    <Glyph
      visibility={actionEvent.type === "initiated" ? "visible" : "hidden"}
      name="spinner"
      height={24}
      width={24}
    />
  );
}
