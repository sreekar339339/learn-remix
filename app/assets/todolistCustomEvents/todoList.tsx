import { clientEntry, css, Frame, on, type Handle } from "remix/ui";
import { AddTodo } from "./addTodo.tsx";
import { Glyph } from "remix/ui/glyph";
import type { Todo } from "../../data/todolist.ts";
import { routes } from "../../routes.ts";
import { CustomEvents } from "../utils/customEvents.tsx";

export const todoEvents = new CustomEvents<{
  actionSubmitted: TodoActionDetail | null;
  actionSucceeded: TodoActionDetail | null;
  actionErrored: { error: Error };
}>();

export type TodoActionDetail = {
  completed?: boolean;
};

export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(handle: Handle<{ todos: Todo[] }>) {
    return () => <_TodoList todos={handle.props.todos} />;
  },
);

export function _TodoList(handle: Handle<{ todos: Todo[] }>) {
  return () => (
    <div
      mix={[
        todoEvents.listen(on("change", ({ detail }) => console.log(detail))),
      ]}
    >
      <AddTodo />
      <Frame
        name="TodoItems"
        src={routes.todolistCustomEvents.todos.index.href()}
        fallback={
          <div mix={css({ display: "flex", alignItems: "center" })}>
            <Glyph name="spinner" height={24} width={24} />
            &nbsp;Loading todos...
          </div>
        }
      />
    </div>
  );
}
