import { clientEntry, css, on, type Handle } from "remix/ui";
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

    type SearchEvent =
      | { type: "loading" }
      | { type: "idle" }
      | { type: "error"; error: Error }
      | { type: "booksFound"; books: Array<{ title: string }> }
      | { type: "booksNotFound" };

    let searchEvent: SearchEvent = initialQuery
      ? { type: "loading" }
      : { type: "idle" };

    let dispatchSearchEvent = createChangeEventListener<SearchEvent>(
      (evt) => {
        searchEvent = evt;
        handle.update();
      },
      { signal: handle.signal },
    );

    handle.queueTask(async (signal) => {
      if (!initialQuery) return;
      try {
        let books = await fetchBooks(initialQuery, signal);
        if (!books.length) {
          return dispatchSearchEvent({ type: "booksNotFound" });
        }
        dispatchSearchEvent({ type: "booksFound", books });
      } catch (error) {
        if (signal.aborted) return;
        dispatchSearchEvent({
          type: "error",
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
                    return void dispatchSearchEvent({ type: "idle" });
                  }
                  dispatchSearchEvent({ type: "loading" });
                  try {
                    let books = await fetchBooks(query, signal);
                    if (!books.length) {
                      return void dispatchSearchEvent({
                        type: "booksNotFound",
                      });
                    }
                    dispatchSearchEvent({ type: "booksFound", books });
                  } catch (error) {
                    if (signal.aborted) return;
                    dispatchSearchEvent({
                      type: "error",
                      error: error as Error,
                    });
                  }
                }),
                css({ padding: 4 }),
              ]}
            />
          </label>
        </div>
        {match(searchEvent)
          .with({ type: "idle" }, () => <p>Enter the name of any book</p>)
          .with({ type: "loading" }, () => <p>loading...</p>)
          .with({ type: "booksFound" }, ({ books }) => (
            <ul>
              {books.map((book) => (
                <li>{book.title}</li>
              ))}
            </ul>
          ))
          .with({ type: "booksNotFound" }, () => (
            <p>Books not found for this query</p>
          ))
          .with({ type: "error" }, ({ error }) => (
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
