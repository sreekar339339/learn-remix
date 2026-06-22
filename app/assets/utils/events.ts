// import { addEventListeners } from "remix/ui";
// import { match, P } from "ts-pattern";
// import { SemanticEventTarget } from "./SemanticEventTarget.js";

import { SemanticEventTarget, type EventShapeInit } from "./SemanticEventTarget.js";

// type SearchEvent =
//   | { type: "querySubmitted"; query: string }
//   | { type: "queryEmpty" }
//   | { type: "error"; error: Error }
//   | { type: "booksFound"; books: Array<{ title: string }> }
//   | { type: "booksNotFound"; reason: "emptyList" | { other: string } };

// let initialEvent: SearchEvent = { type: "queryEmpty" };

// let searchEvtTarget = new SemanticEventTarget<SearchEvent>({
//   event: initialEvent,
//   onChange(event) {
//     // Object.assign(searchEvent, evt)
//     match(event)
//       .with(
//         { type: "booksNotFound", reason: "emptyList" },
//         () => "boons not found",
//       )
//       .with(
//         { type: "booksNotFound", reason: { other: P.select() } },
//         (val) => val.charCodeAt,
//       )
//       .with({ type: "booksFound", books: P.select() }, (val) => val.map) // val is { title: string; }[] | undefined
//       .with({ type: "error", error: P.select() }, (val) => val.name.charAt) // val is Error | undefined
//       .with({ type: "queryEmpty" }, () => void 1)
//       .with({ type: "querySubmitted", query: P.select() }, (val) => val.charAt)
//       .exhaustive();
//   },
// });

// searchEvtTarget.addEventListener("booksFound", val => {
//   val.books;
// });

// searchEvtTarget.addEventListener("change", val => {
//   val.type;
// });

// await searchEvtTarget.dispatchEvent("booksFound", {
//   books: [{ title: "Dune" }],
// });

// searchEvtTarget.dispatchEvent("error", { error: new Error() });
// searchEvtTarget.dispatchEvent("booksFound", { books: [] });

// searchEvtTarget.event
// searchEvtTarget.state

// const signal = {} as AbortSignal

// addEventListeners(searchEvtTarget, signal, {
//   error({ error }) {
//     error.name.charAt;
//   },
//   booksFound(val) {
//     val.books.map;
//   },
//   queryEmpty() {},
//   booksNotFound({ reason }) {
//     reason;
//   },
// });

// // POJO usage

// type User = { name: string };
// type Settings = { theme: "dark" | "light" };
// type AppContext = {
//   user: User;
//   settings: Settings;
// };

// let initialContext: AppContext = {
//   user: { name: "jack" },
//   settings: { theme: "dark" },
// };

// let appContextEvtTarget = new SemanticEventTarget<AppContext>({
//   state: initialContext
// });

// appContextEvtTarget.dispatchEvent("settingsChange", { theme: "dark" });
// await appContextEvtTarget.dispatchEvent("userChange", { name: "bob" });
// appContextEvtTarget.addEventListener("settingsChange", (evt) => {
//   evt.theme.charAt;
// });

// appContextEvtTarget.addEventListener("change", (evt) => {
//   match(evt)
//     .with({ settings: P.select() }, (val) => val?.theme.charAt)
//     .with({ user: P.select() }, (val) => val.name.charAt)
//     .exhaustive();
// });

// addEventListeners(appContextEvtTarget, signal, {
//   settingsChange({ theme }) {
//     theme.charAt;
//   },
//   userChange({ name }) {
//     name.charAt;
//   },
//   change(val) {
//     if (val.type === "userChange") {
//       val.user.name.charAt;
//     } else {
//       val.settings.theme.charAt;
//     }
//   },
// });

// appContextEvtTarget.event;
// // { type: "userChange", user: { name: "Mary" } }

// appContextEvtTarget.state;
// // {
// //   user: { name: "Mary" },
// //   settings: { theme: "dark" }
// // }


