import {
  addEventListeners,
  clientEntry,
  css,
  on,
  ref,
  type Handle,
  type RefCallback,
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
    dispatch("search:querySubmitted", { query });
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
      return void dispatch("search:booksNotFound", {
        reason: { other: json.detail[0].msg },
      });
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatch("search:booksNotFound", {
        reason: "emptyList",
      });
    }
    dispatch("search:booksFound", books);
  } catch (error) {
    dispatch("search:errorOccurred", error as Error);
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
  interface HTMLElementEventMap extends Namespaced<SearchEventMap, "search"> {}
}

function SearchBooksNewEventHandler(handle: Handle<{ initialQuery: string }>) {
  let { initialQuery } = handle.props;

  let searchTargetRef: RefCallback<HTMLInputElement> = (target, signal) => {
    addEventListeners(target, signal, {
      "search:change"({ detail }) {
        searchEvent = detail.event;
        handle.update();
      },
      input(_, signal) {
        let dispatch = dispatchCustomEvent(target, signal);
        let query = target.value.trim();
        if (!query) return void dispatch("search:queryEmpty");
        fetchBooks(query, dispatch, signal);
      },
    });
    target.select();
    target.dispatchEvent(new Event("input"));
  };

  let searchEvent: SearchEventMap["change"]["detail"]["event"] = initialQuery
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
          class={searchEvent?.type === 'querySubmitted' ? 'pending': ''}
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
            ref(searchTargetRef),
          ]}
        />
      </label>
      {match(searchEvent)
        .with({ type: "queryEmpty" }, undefined, () => <p>Enter the title of any book.</p>)
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
          on("search:change", (evt) => {
            console.log("in parent", evt.detail);
          }),
        ]}
      >
        <SearchBooksNewEventHandler initialQuery={handle.props.initialQuery} />
      </div>
    );
  },
);
