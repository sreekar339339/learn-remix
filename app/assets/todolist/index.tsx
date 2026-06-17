import {
  clientEntry,
  css,
  Frame,
  on,
  ref,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { routes } from "../../routes.ts";

export const TodolistIndex = clientEntry(
  import.meta.url,
  function TodolistIndex(handle: Handle) {
    let input: HTMLInputElement;

    let submit = async (
      evt: Dispatched<SubmitEvent, HTMLFormElement>,
      signal: AbortSignal,
    ) => {
      evt.preventDefault()
      let form = evt.currentTarget;
      const formAction = new URL(form.action)
      formAction.searchParams.set('redirectTo', 'none')
      try {
        let resp = await fetch(formAction, {
          method: "POST",
          body: new FormData(form),
          signal,
        });
        if (!resp.ok) new Error(resp.statusText, { cause: resp.status });
        if (signal.aborted) return;
        await handle.frames.get('todoItems')?.reload();
        form.reset()
      } catch (error) {
        console.error(error);
      } finally {

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
          <label>
            Enter a todo{" "}
            <input
              mix={[css({ padding: 4 }), ref((node) => (input = node))]}
              name="text"
              autofocus
            />
          </label>
        </form>
        <Frame
          name="todoItems"
          src={routes.todolist.todos.index.href()}
          // fallback={<p>fetching your todos...</p>}
        />
      </>
    );
  },
);
