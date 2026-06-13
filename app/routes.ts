import { get, route } from 'remix/routes'

export const routes = route({
  assets: get('/assets/*path'),
  index: get('/'),
  ticTacToe: get('/ticTacToe'),
  asyncActions: get('/asyncActions'),
  api: route('api', {
    books: get('/books')
  })
})
