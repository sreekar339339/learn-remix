import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  type CustomEventMap,
  type DispatchCustomEvent,
  type Namespaced,
  dispatchCustomEvent,
} from "./utils/customEvent.ts";

async function fetchBooks(
  query: string,
  dispatch: DispatchCustomEvent<HTMLInputElement, "bookSearch">,
  signal: AbortSignal,
) {
  try {
    dispatch({ querySubmitted: { query } });
    let resp = await fetch(
      routes.searchBooks.books.href(undefined, { q: query }),
      {
        signal,
        headers: {
          'Content-Type': 'application/json'
        }
      },
    );
    if (!resp.ok) {
      throw new Error(`${resp.status} ${resp.statusText}`, {
        cause: await resp.text(),
      });
    }
    let json = await resp.json();
    if (!("docs" in json)) {
      return void dispatch({
        booksNotFound: { reason: { other: json.detail[0].msg } },
      });
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatch({ booksNotFound: { reason: "emptyList" } });
    }
    dispatch({ booksFound: books });
  } catch (error) {
    dispatch({ errorOccurred: error as Error });
  }
}

type SearchEventMap = CustomEventMap<{
  booksFound: Array<{ title: string }>;
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
  queryEmpty: null;
  querySubmitted: { query: string };
}>;

declare global {
  interface HTMLElementEventMap extends Namespaced<
    SearchEventMap,
    "bookSearch"
  > {}
}

function SearchBooksWithoutFrame_(handle: Handle<{ initialQuery: string }>) {
  let { initialQuery } = handle.props;

  let bookSearchEvt: SearchEventMap["change"]["detail"] = initialQuery
    ? {
        type: "querySubmitted",
        detail: { query: initialQuery },
        details: { querySubmitted: { query: initialQuery } },
      }
    : { type: "queryEmpty", detail: null, details: { queryEmpty: null } };

  return () => (
    <>
      <label>
        Search{" "}
        <input
          type="text"
          defaultValue={initialQuery}
          class={bookSearchEvt?.type === "querySubmitted" ? "pending" : ""}
          mix={[
            css({
              padding: 4,
              "&.pending": {
                backgroundImage:
                  "linear-gradient(100deg, transparent 0%, transparent 35%, rgba(45, 172, 249, 0.28) 50%, transparent 65%, transparent 100%)",
                backgroundSize: "220% 100%",
                animation: "glimmer 1.15s linear infinite",
                borderColor: "var(--brand-blue)",
              },
              "@media (prefers-reduced-motion: reduce)": {
                animation: "none",
              },
            }),
            on("input", (evt, signal) => {
              let query = evt.currentTarget.value.trim();
              let dispatch = dispatchCustomEvent.bind(null, {
                target: evt.currentTarget,
                signal,
                namespace: "bookSearch",
              });
              if (!query) {
                return void dispatch({ queryEmpty: null });
              }
              fetchBooks(query, dispatch, signal);
            }),
            on("bookSearch:change", ({ detail, currentTarget }) => {
              bookSearchEvt = detail;
              handle.update();
              if (detail.type !== "querySubmitted") {
                currentTarget.select();
              }
            }),
            ref((input) => input.dispatchEvent(new Event("input"))),
          ]}
        />
      </label>
      {match(bookSearchEvt)
        .with({ type: "queryEmpty" }, () => <p>Enter the title of any book.</p>)
        .with({ type: "querySubmitted" }, ({ detail: { query } }) => (
          <p>fetching books with title containing {query}...</p>
        ))
        .with({ type: "booksFound" }, ({ detail: books }) => (
          <ul>
            {books.map((book) => (
              <li>{book.title}</li>
            ))}
          </ul>
        ))
        .with(
          { type: "booksNotFound", detail: { reason: "emptyList" } },
          () => <p>No books were found for this title at this time.</p>,
        )
        .with(
          {
            type: "booksNotFound",
            detail: { reason: { other: P.select() } },
          },
          (msg) => <p>Could not fetch books for this title. Reason: {msg}.</p>,
        )
        .with({ type: "errorOccurred" }, ({ detail: error }) => (
          <p>
            Unexpected error occured, try again! {error.message} Cause:{" "}
            {error.cause as string}.
          </p>
        ))
        .with({ type: P.array(P._) }, () => null)
        .exhaustive()}
    </>
  );
}

export const SearchBooksWithoutFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithoutFrame(
    handle: Handle<{ initialQuery: string }>,
  ) {
    return () => (
      <div
        mix={[
          on("bookSearch:change", (evt) => {
            console.log("in parent", evt.detail);
          }),
        ]}
      >
        <SearchBooksWithoutFrame_ initialQuery={handle.props.initialQuery} />
      </div>
    );
  },
);
