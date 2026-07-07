import {
  addEventListeners,
  clientEntry,
  css,
  Frame,
  ref,
  TypedEventTarget,
  type Handle,
  type Props,
} from "remix/ui";
import { AddTodo } from "./addTodo.tsx";
import { Glyph } from "remix/ui/glyph";
import type { Todo } from "../../data/todolist.ts";
import type { CustomEventMap } from "../utils/customEvent.ts";
import { routes } from "../../routes.ts";

export type TodoActionEventMap = CustomEventMap<{
  actionSubmitted: null;
  actionSucceeded: null;
  actionErrored: { error: Error };
}>;

export let actionTarget = new TypedEventTarget<TodoActionEventMap>();

export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(handle: Handle<{ todos: Todo[] }>) {
    return () => <_TodoList todos={handle.props.todos} />;
  },
);

export function _TodoList(
  handle: Handle<{ todos: Todo[] }>,
) {
  addEventListeners(actionTarget, handle.signal, {
    change({detail}) {
      console.log(detail)
    }
  })
  return () => (
    <div>
      <AddTodo />
      <Frame
        name="TodoItems"
        src={routes.todolist.todos.index.href()}
        fallback={
          <div mix={css({ display: "flex", alignItems: "center" })}>
            <Glyph name="spinner" height={24} width={24} />
            &nbsp;Loading todos...
          </div>
        }
      />
      {/* <TodoItems todos={handle.props.todos} /> */}
    </div>
  );
}
