import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import { SemanticEventTarget } from "./utils/SemanticEventTarget.js";

async function fetchBooks(
  query: string,
  searchEventTarget: SemanticEventTarget<SearchEvent>,
  signal: AbortSignal,
) {
  try {
    let resp = await fetch(routes.asyncActions.withoutFrame.api.books.href(undefined, { q: query }), {
      signal,
    });
    if (!resp.ok) throw new Error(resp.statusText, { cause: resp.status });
    let json = await resp.json();
    if (signal.aborted) throw new DOMException(signal.reason, "AbortError");
    if (!("docs" in json)) {
      return void searchEventTarget.dispatchEvent({type: 'booksNotFound', reason: {other: json.detail[0].msg}})
    }
    let books = json.docs;
    if (!books.length) {
      return void searchEventTarget.dispatchEvent({
        type: "booksNotFound",
        reason: 'emptyList'
      });
    }
    searchEventTarget.dispatchEvent({ type: "booksFound", books });
  } catch (error) {
    if (signal.aborted) return;
    searchEventTarget.dispatchEvent({
      type: "error",
      error: error as Error,
    });
  }
}

type SearchEvent =
  | { type: "querySubmitted", query: string }
  | { type: "queryEmpty" }
  | { type: "error"; error: Error }
  | { type: "booksFound"; books: Array<{ title: string }> }
  | { type: "booksNotFound", reason: 'emptyList' | {other: string} };

export const SearchBooks = clientEntry(
  import.meta.url,
  function (handle: Handle<{ initialQuery?: string }>) {
    let { initialQuery } = handle.props;
    let input: HTMLInputElement;

    let searchEvent: SearchEvent = initialQuery
      ? { type: "querySubmitted", query: initialQuery }
      : { type: "queryEmpty" };

    let searchEvtTarget = new SemanticEventTarget<SearchEvent>(
      (evt) => {
        searchEvent = evt;
        handle.update();
      },
      { signal: handle.signal },
    );

    handle.queueTask(async (signal) => {
      input.select()
      if (!initialQuery) return;
      fetchBooks(initialQuery, searchEvtTarget, signal)
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
                    return void searchEvtTarget.dispatchEvent({ type: "queryEmpty" });
                  }
                  searchEvtTarget.dispatchEvent({ type: "querySubmitted", query });
                  fetchBooks(query, searchEvtTarget, signal)
                }),
                css({ padding: 4 }),
                ref(node => input = node)
              ]}
            />
          </label>
        </div>
        {match(searchEvent)
          .with({ type: "queryEmpty" }, () => <p>Enter the title of any book.</p>)
          .with({ type: "querySubmitted" }, ({query}) => <p>fetching books with title containing {query}...</p>)
          .with({ type: "booksFound" }, ({ books }) => (
            <ul>
              {books.map((book) => (
                <li>{book.title}</li>
              ))}
            </ul>
          ))
          .with({ type: "booksNotFound", reason: 'emptyList' }, () => (
            <p>Books not found for this title at this time.</p>
          ))
          .with({ type: "booksNotFound", reason: {other: P.select()} }, (msg) => (
            <p>Could not fetch books. reason: {msg}.</p>
          ))
          .with({ type: "error" }, ({ error }) => (
            <p>
              Unexpected error occured, try again! {error.message} Cause:{" "}
              {error.cause as string}.
            </p>
          ))
          .exhaustive()}
      </>
    );
  },
);
