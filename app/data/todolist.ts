export type Todo = {
  id: string;
  completed: boolean;
  text: string;
};

export let todos: Todo[] = [
  { id: Date.now().toString(), completed: false, text: "grocery" },
  { id: Date.now().toString()+'1', completed: true, text: "sports" },
];

export function addTodos(text: string) {
  todos.push({id: Date.now().toString(), text, completed: false})
}

export function updateTodos(id: string, field: {text: string} | { completed: boolean}) {
  for (let _todo of todos) {
    if (_todo.id === id) {
      return Object.assign(_todo, field)
    }
  }
  throw new Error('given id is not found in db')
}

export function deleteTodos(id: string) {
  for (let [idx, _todo] of todos.entries()) {
    if (_todo.id === id) {
      return todos.splice(idx, 1)
    }
  }
  throw new Error('given id is not found in db')
}