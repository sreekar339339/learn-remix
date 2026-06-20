import { Layout } from "../ui/layout.tsx";
import { TodoList } from "../assets/todolist/todoList.tsx";

export function TodoListPage() {
  return () => (
    <Layout>
      <section>
        <h1>Todo-list</h1>
        <TodoList />
      </section>
    </Layout>
  )
}