import { form, get, resource, route, put, resources, post, del } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  index: get('/'),
  ticTacToe: get('ticTacToe'),
  asyncActions: route('asyncActions', {
    withoutFrame: route('withoutFrame', {
      index: get('/'),
      api: route('api', {
        books: get('books')
      }),
    }),
    withFrame: route('withFrame', {
      index: get('/'),
      frame: get('books')
    })
  }),
  todolist: route('todolist', {
    index: get(''),
    todos: form('todos')
  })
})
