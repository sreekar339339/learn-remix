import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import { createSemanticEventListener } from "../utils/events.ts";

async function fetchBooks(
  query: string,
  dispatchSearchEvent: ReturnType<
    typeof createSemanticEventListener<SearchEvent>
  >,
  signal: AbortSignal,
) {
  try {
    let resp = await fetch(routes.api.books.href(undefined, { q: query }), {
      signal,
    });
    if (!resp.ok) throw new Error(resp.statusText, { cause: resp.status });
    let json = await resp.json();
    if (signal.aborted) throw new DOMException(signal.reason, "AbortError");
    if (!("docs" in json)) {
      return void dispatchSearchEvent({type: 'booksNotFound', reason: {other: json.detail[0].msg}})
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatchSearchEvent({
        type: "booksNotFound",
        reason: 'emptyList'
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
}

type SearchEvent =
  | { type: "fetching" }
  | { type: "idle" }
  | { type: "error"; error: Error }
  | { type: "booksFound"; books: Array<{ title: string }> }
  | { type: "booksNotFound", reason: 'emptyList' | {other: string} };

export const SearchResults = clientEntry(
  import.meta.url,
  function (handle: Handle<{ initialQuery?: string }>) {
    let { initialQuery } = handle.props;
    let input: HTMLInputElement;

    let searchEvent: SearchEvent = initialQuery
      ? { type: "fetching" }
      : { type: "idle" };

    let dispatchSearchEvent = createSemanticEventListener<SearchEvent>(
      (evt) => {
        searchEvent = evt;
        handle.update();
      },
      { signal: handle.signal },
    );

    handle.queueTask(async (signal) => {
      input.focus()
      if (!initialQuery) return;
      fetchBooks(initialQuery, dispatchSearchEvent, signal)
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
                  dispatchSearchEvent({ type: "fetching" });
                  fetchBooks(query, dispatchSearchEvent, signal)
                }),
                css({ padding: 4 }),
                ref(node => input = node)
              ]}
            />
          </label>
        </div>
        {match(searchEvent)
          .with({ type: "idle" }, () => <p>Enter the title of any book</p>)
          .with({ type: "fetching" }, () => <p>fetching books...</p>)
          .with({ type: "booksFound" }, ({ books }) => (
            <ul>
              {books.map((book) => (
                <li>{book.title}</li>
              ))}
            </ul>
          ))
          .with({ type: "booksNotFound", reason: 'emptyList' }, () => (
            <p>Books not found for this title</p>
          ))
          .with({ type: "booksNotFound", reason: {other: P.select()} }, (msg) => (
            <p>Could not fetch books, reason: {msg}</p>
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
