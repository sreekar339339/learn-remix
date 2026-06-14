import {
  clientEntry,
  css,
  on,
  type Handle,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import { createChangeEventListener } from "../utils/events.ts";

async function fetchBooks(query: string, signal: AbortSignal) {
  let resp = await fetch(routes.api.books.href(undefined, { q: query }), {
    signal,
  });
  if (!resp.ok) throw new Error(resp.statusText, { cause: resp.status });
  let books = (await resp.json()).docs;
  if (signal.aborted) new DOMException(signal.reason, "AbortError");
  return books;
}

export const SearchResults = clientEntry(
  import.meta.url,
  function (handle: Handle<{ initialQuery?: string }>) {
    let { initialQuery } = handle.props;

    type State =
      | { kind: "loading" }
      | { kind: "idle" }
      | { kind: "error"; error: Error }
      | { kind: "booksFound"; books: Array<{ title: string }> }
      | { kind: "booksNotFound" };

    let state: State = initialQuery ? { kind: "loading" } : { kind: "idle" };

    let dispatchEvent = createChangeEventListener<State>(
      (evt) => {
        state = evt.detail;
        handle.update();
      },
      { signal: handle.signal },
    );

    handle.queueTask(async (signal) => {
      if (!initialQuery) return;
      try {
        let books = await fetchBooks(initialQuery, signal);
        if (!books.length) {
          return dispatchEvent({ kind: "booksNotFound" });
        }
        dispatchEvent({ kind: "booksFound", books });
      } catch (error) {
        if (signal.aborted) return;
        dispatchEvent({
          kind: "error",
          error: error as Error,
        });
      }
    });

    return () => (
      <>
        <div>
          <label>
            Search{" "}
            <input
              type="text"
              defaultValue={initialQuery}
              mix={[
                on("input", async (evt, signal) => {
                  const query = evt.currentTarget.value.trim();
                  if (!query) {
                    return void dispatchEvent({ kind: "idle" });
                  }
                  dispatchEvent({ kind: "loading" });
                  try {
                    let books = await fetchBooks(query, signal);
                    if (!books.length) {
                      return void dispatchEvent({
                        kind: "booksNotFound",
                      });
                    }
                    dispatchEvent({ kind: "booksFound", books });
                  } catch (error) {
                    if (signal.aborted) return;
                    dispatchEvent({
                      kind: "error",
                      error: error as Error,
                    });
                  }
                }),
                css({ padding: 4 }),
              ]}
            />
          </label>
        </div>
        {match(state)
          .with({ kind: "idle" }, () => <p>Enter the name of any book</p>)
          .with({ kind: "loading" }, () => <p>loading...</p>)
          .with({ kind: "booksFound" }, ({ books }) => (
            <ul>
              {books.map((book) => (
                <li>{book.title}</li>
              ))}
            </ul>
          ))
          .with({ kind: "booksNotFound" }, () => (
            <p>Books not found for this query</p>
          ))
          .with({ kind: "error" }, ({ error }) => (
            <p>
              Unexpected error occured, try again! {error.message} Cause:{" "}
              {error.cause as string}
            </p>
          ))
          .exhaustive()}
      </>
    );
  },
);
