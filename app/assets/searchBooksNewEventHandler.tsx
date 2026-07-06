import {
  clientEntry,
  css,
  on,
  ref,
  type Handle,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  type CustomEventMap,
  type Namespaced,
  dispatchCustomEvent,
} from "./utils/customEvent.ts";

async function fetchBooks(
  query: string,
  dispatch: dispatchCustomEvent.Dispatcher<HTMLDivElement>,
  signal: AbortSignal,
) {
  try {
    dispatch("bookSearch:querySubmitted", { query });
    let resp = await fetch(
      routes.asyncActions.withoutFrame.api.books.href(undefined, { q: query }),
      {
        signal,
      },
    );
    if (!resp.ok) {
      throw new Error(`${resp.status} ${resp.statusText}`, {
        cause: await resp.text(),
      });
    }
    let json = await resp.json();
    if (!("docs" in json)) {
      return void dispatch("bookSearch:booksNotFound", {
        reason: { other: json.detail[0].msg },
      });
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatch("bookSearch:booksNotFound", {
        reason: "emptyList",
      });
    }
    dispatch("bookSearch:booksFound", books);
  } catch (error) {
    dispatch("bookSearch:errorOccurred", error as Error);
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

function SearchBooksNewEventHandler(handle: Handle<{ initialQuery: string }>) {
  let { initialQuery } = handle.props;

  let bookSearchEvt: SearchEventMap["change"]["detail"]["event"] = initialQuery
    ? {
        type: "querySubmitted",
        detail: { query: initialQuery },
      }
    : { type: "queryEmpty" };

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
              let dispatch = dispatchCustomEvent(evt.currentTarget, signal);
              let query = evt.currentTarget.value.trim();
              if (!query) return void dispatch("bookSearch:queryEmpty");
              fetchBooks(query, dispatch, signal);
            }),
            on("bookSearch:change", ({ detail: { event }, currentTarget }) => {
              bookSearchEvt = event;
              handle.update();
              if (event?.type !== "querySubmitted") {
                currentTarget.select();
              }
            }),
            ref((input) => input.dispatchEvent(new Event("input"))),
          ]}
        />
      </label>
      {match(bookSearchEvt)
        .with({ type: "queryEmpty" }, undefined, () => (
          <p>Enter the title of any book.</p>
        ))
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
        .exhaustive()}
    </>
  );
}

export const SearchBooksNewEventHandlerParent = clientEntry(
  import.meta.url,
  function SearchBooksNewEventHandlerParent(
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
        <SearchBooksNewEventHandler initialQuery={handle.props.initialQuery} />
      </div>
    );
  },
);
