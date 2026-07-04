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
import type {
  CustomEventMap,
  Namespaced,
} from "../utils/customEvent.ts";
import { routes } from "../../routes.ts";

export type TodoActionEventMap = CustomEventMap<{
  actionSubmitted: { form: HTMLFormElement };
  actionSucceeded: { form: HTMLFormElement };
  actionErrored: { error: Error; form: HTMLFormElement };
  idle: null;
}>;

export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(handle: Handle<{ todos: Todo[] }>) {
    return () => <_TodoList todos={handle.props.todos} />;
  },
);

export function _TodoList(handle: Handle<{ todos: Todo[] }, TypedEventTarget<TodoActionEventMap>>) {
  let actionLogger = new TypedEventTarget<TodoActionEventMap>
  addEventListeners(actionLogger, handle.signal, {
    change({detail}) {
      console.log(detail)
    }
  })
  handle.context.set(actionLogger)
  return () => (
    <>
      <AddTodo />
      <Frame
        name="TodoItems"
        src={routes.todolist.todos.index.href()}
        fallback={
          <div mix={css({display: 'flex', alignItems: 'center'})}>
            <Glyph name="spinner" height={24} width={24} />&nbsp;Loading todos...
          </div>
        }
      />
      {/* <TodoItems todos={handle.props.todos} /> */}
    </>
  );
}
