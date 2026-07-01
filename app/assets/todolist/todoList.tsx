import {
  addEventListeners,
  clientEntry,
  css,
  Frame,
  ref,
  type Handle,
  type Props,
} from "remix/ui";
import { AddTodo } from "./addTodo.tsx";
import { Glyph } from "remix/ui/glyph";
import type { Todo } from "../../data/todolist.ts";
import type { CustomEventMap } from "../utils/customEvent.ts";
import { routes } from "../../routes.ts";

export type TodoActionEventMap = CustomEventMap<
  {
    actionSubmitted: { form: HTMLFormElement };
    actionSucceeded: { form: HTMLFormElement };
    actionErrored: { error: Error; form?: HTMLFormElement };
    idle: null;
  },
  "todo"
>;
type TodoActionEventTypes = TodoActionEventMap['types']

declare global {
  interface HTMLElementEventMap extends TodoActionEventTypes {}
}

export const TodoList = clientEntry(
  import.meta.url,
  function TodoList(handle: Handle<{ todos: Todo[] }>) {
    return () => <_TodoList todos={handle.props.todos} />;
  },
);

export function _TodoList(handle: Handle<{ todos: Todo[] }, HTMLDivElement>) {
  return () => (
    <div mix={[ref((node) => handle.context.set(node)), css({display: 'contents'})]}>
      <AddTodo />
      <ActionStatus />
      <Frame
        name="TodoItems"
        src={routes.todolist.todos.index.href()}
        fallback={
          <div mix={css({display: 'flex', alignItems: 'center'})}>
            <ActionStatus pending={true} />&nbsp;Loading todos...
          </div>
        }
      />
      {/* <TodoItems todos={handle.props.todos} /> */}
    </div>
  );
}

function ActionStatus(handle: Handle<Props<"div"> & { pending?: boolean }>) {
  let spinnerRevealTimeoutId: any;
  let eventName: keyof HTMLElementEventMap = handle.props.pending
    ? "todo:actionSubmitted"
    : "todo:idle";
  let error: Error;
  handle.queueTask(() => {
    addEventListeners(handle.context.get(_TodoList), handle.signal, {
      "todo:change"({detail}) {
        eventName = detail.event
        if (detail.event === 'todo:actionSubmitted') {
          spinnerRevealTimeoutId = setTimeout(() => handle.update(), 300);
          return;
        }
        if (detail.event === 'todo:actionErrored') {
          error = detail.detail.error;
        }
        clearTimeout(spinnerRevealTimeoutId);
        handle.update();
      },
    });
  });
  return () => (
    <p
      mix={[
        css({
          height: 24,
          display: 'inline-block'
        }),
      ]}
    >
      {eventName === "todo:actionSubmitted" ? (
        <Glyph name="spinner" height={24} width={24} />
      ) : eventName === "todo:actionErrored" ? (
        <>Oops! Please try again!</>
      ) : null}
    </p>
  );
}
