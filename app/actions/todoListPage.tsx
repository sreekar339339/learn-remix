import { Frame } from "remix/ui";
import { AddTodo } from "../assets/todolist/addTodo.tsx";
import { Layout } from "../ui/layout.tsx";
import { routes } from "../routes.ts";

export function TodoListPage() {
  return () => (
    <Layout>
      <section>
        <h1>Todo-list</h1>
        <AddTodo />
        <Frame name="todoItems" src={routes.todolist.todos.index.href()} />
      </section>
    </Layout>
  )
}