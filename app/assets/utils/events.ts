// import { addEventListeners } from "remix/ui";
// import { match, P } from "ts-pattern";
// import { SemanticEventTarget } from './SemanticEventTarget.js'

// type SearchEvent =
//   | { type: "querySubmitted", query: string }
//   | { type: "queryEmpty" }
//   | { type: "error"; error: Error }
//   | { type: "booksFound"; books: Array<{ title: string }> }
//   | { type: "booksNotFound", reason: 'emptyList' | {other: string} };

// type f = keyof SearchEvent

// let searchEvent: SearchEvent = { type: "queryEmpty" };

// let f = new SemanticEventTarget<SearchEvent>((evt) => {
//   searchEvent = evt
//   // Object.assign(searchEvent, evt)
//   match(evt)
//     .with({type: 'booksNotFound', reason: 'emptyList'}, () => 'boons not found')
//     .with({type: 'booksNotFound', reason: {other: P.select()}}, (val) => val.charCodeAt)
//     .with({type: 'booksFound', books: P.select()}, (val) => val.map) // val is { title: string; }[] | undefined
//     .with({type: 'error', error: P.select()}, (val) => val.name.charAt) // val is Error | undefined
//     .with({type: 'queryEmpty'}, () => void 1)
//     .with({type: 'querySubmitted', query: P.select()}, (val) => val.charAt)
//     .exhaustive()
// })

// f.dispatchEvent({type: 'error', error: new Error()})
// f.dispatchEvent({type:'booksFound'})

// type L = keyof NonNullable<typeof f.__eventMap>

// addEventListeners(f, new AbortSignal(), {
//   error(val) {
//     val.error
//   },
//   booksFound(val) {
//     val.books
//   },
//   change(val) {
//     searchEvent = val
//   }
// })




// type User = {name: string}
// type Settings = {theme: 'dark' | 'light'}
// type AppContext = {
//   user: User,
//   settings: Settings
// }

// let context: AppContext = {
//   user: {name: 'jack'},
//   settings: {theme: 'dark'}
// }

// let g = new SemanticEventTarget<AppContext>((evt) => {
//   context = evt
//   // evt.settings
//   evt.type
//   Object.assign(context, evt)
//   match(evt)
//     .with({type: 'settings', settings: P.select()}, (val) => val.theme.charAt)
//     .with({type: 'user', user: P.select()}, (val) => val.name.charAt)
//     .exhaustive()
// })

// g.dispatchEvent({type: 'settings', settings: {theme: 'dark'}})
// g.dispatchEvent({type: 'user', user: {name: 'bob'}})
// g.dispatchEvent({type: 'settings', user: {name: 'bob'}})
// g.addEventListener('settings', (evt) => {
//   evt.theme.charAt
// })

// g.addEventListener('change', (evt) => {
//   Object.assign(context, evt)
//   match(evt)
//     .with({settings: P.select()}, (val) => val?.theme.charAt)
//     .with({user: P.select()}, (val) => val.name.charAt)
//     .exhaustive()
// })

// addEventListeners(g, new AbortSignal(), {
//   settings(val) {
//     val.theme.charAt
//   },
//   user(val) {
//     val.name.charAt
//   },
//   change(val) {
//     searchEvent = val
//   }
// })




// // f.addEventListener('type', (evt) => {
// //   match(evt)
// // }, {signal: new AbortSignal()})