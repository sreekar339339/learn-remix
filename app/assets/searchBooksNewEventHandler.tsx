import {
  addEventListeners,
  clientEntry,
  css,
  on,
  ref,
  type Handle,
  type Props,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  customEvents,
  type DispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEventMixin.ts";

async function fetchBooks(
  query: string,
  dispatchCustomEvent: DispatchCustomEvent<SearchEventMap>,
  signal: AbortSignal,
) {
  try {
    dispatchCustomEvent("myapp:search:querySubmitted", { query }, signal);
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
      return void dispatchCustomEvent(
        "myapp:search:booksNotFound",
        {
          reason: { other: json.detail[0].msg },
        },
        signal,
      );
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatchCustomEvent(
        "myapp:search:booksNotFound",
        {
          reason: "emptyList",
        },
        signal,
      );
    }
    dispatchCustomEvent("myapp:search:booksFound", { books }, signal);
  } catch (error) {
    dispatchCustomEvent(
      "myapp:search:error",
      {
        error: error as Error,
      },
      signal,
    );
  }
}

type SearchEventMap = CustomEventMap<
  {
    booksFound: { books: Array<{ title: string }> };
    booksNotFound: { reason: "emptyList" | { other: string } };
    error: { error: Error };
    queryEmpty: null;
    querySubmitted: { query: string };
  },
  "search"
>;

declare global {
  interface HTMLElementEventMap extends SearchEventMap {}
}

interface SearchBooksProps extends Props<"div"> {
  initialQuery: string;
}

function SearchBooksNewEventHandler(handle: Handle<SearchBooksProps>) {
  let { initialQuery } = handle.props;

  let searchEvent: SearchEventMap["myapp:search:change"]["detail"] | undefined =
    undefined;

  let events = customEvents<SearchEventMap, HTMLDivElement>(
    ({ target, dispatchCustomEvent }) => {
      addEventListeners(target, handle.signal, {
        "myapp:search:change"({ detail }) {
          searchEvent = detail;
          handle.update();
        },
        input(evt, signal) {
          let input = evt.target as HTMLInputElement | null;
          if (!input) return;
          const query = input.value.trim();
          if (!query) {
            return void dispatchCustomEvent("myapp:search:queryEmpty", signal);
          }
          fetchBooks(query, dispatchCustomEvent, signal);
        },
      });
    },
  );

  return () => (
    <div mix={[events]}>
      <div>
        <label>
          Search{" "}
          <input
            type="text"
            defaultValue={initialQuery}
            mix={[
              css({ padding: 4 }),
              ref((node) => {
                node.select();
                // requestAnimationFrame(() => {
                  node.dispatchEvent(new Event("input", { bubbles: true }));
                // });
              }),
            ]}
          />
        </label>
      </div>
      {searchEvent &&
        match(searchEvent)
          .with({ type: "myapp:search:queryEmpty" }, () => (
            <p>Enter the title of any book.</p>
          ))
          .with({ type: "myapp:search:querySubmitted" }, ({ query }) => (
            <p>fetching books with title containing {query}...</p>
          ))
          .with({ type: "myapp:search:booksFound" }, ({ books }) => (
            <ul>
              {books.map((book) => (
                <li>{book.title}</li>
              ))}
            </ul>
          ))
          .with(
            { type: "myapp:search:booksNotFound", reason: "emptyList" },
            () => <p>No books were found for this title at this time.</p>,
          )
          .with(
            {
              type: "myapp:search:booksNotFound",
              reason: { other: P.select() },
            },
            (msg) => (
              <p>Could not fetch books for this title. Reason: {msg}.</p>
            ),
          )
          .with({ type: "myapp:search:error" }, ({ error }) => (
            <p>
              Unexpected error occured, try again! {error.message} Cause:{" "}
              {error.cause as string}.
            </p>
          ))
          .exhaustive()}
    </div>
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
          on("myapp:search:change", (evt) => {
            console.log("in parent", evt.detail);
          }),
        ]}
      >
        <SearchBooksNewEventHandler initialQuery={handle.props.initialQuery} />
      </div>
    );
  },
);
