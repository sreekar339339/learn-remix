import {
  addEventListeners,
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
  dispatchCustomEvent,
} from "./utils/customEvent.ts";

async function fetchBooks(
  query: string,
  dispatch: SearchEventMap["dispatcher"],
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

type SearchEventMap = CustomEventMap<
  {
    booksFound: Array<{ title: string }>;
    booksNotFound: { reason: "emptyList" | { other: string } };
    errorOccurred: Error;
    queryEmpty: null;
    querySubmitted: { query: string };
  },
  { namespace: "search"; target: HTMLDivElement }
>;

type SearchEventTypes = SearchEventMap["namespacedEvents"];

// declare global {
//   interface HTMLElementEventMap extends SearchEventTypes {}
// }

function SearchBooksNewEventHandler(handle: Handle<{ initialQuery: string }>) {
  let { initialQuery } = handle.props;

  let searchTargetRef = (target: SearchEventMap["target"]) => {
    addEventListeners(target, handle.signal, {
      "search:change"({ detail }) {
        searchEvent = detail;
        handle.update();
      },
      input(evt, signal) {
        let dispatch = dispatchCustomEvent(target, signal);
        let query = (evt.target as HTMLInputElement).value.trim();
        if (!query) return void dispatch("search:queryEmpty");
        fetchBooks(query, dispatch, signal);
      },
    });
  };

  let searchEvent: SearchEventMap["events"]["change"]["detail"] =
    initialQuery
      ? {
          type: "querySubmitted",
          detail: { query: initialQuery },
        }
      : { type: "queryEmpty" };

  return () => (
    <div mix={[css({ display: "contents" }), ref(searchTargetRef)]}>
      <label>
        Search{" "}
        <input
          type="text"
          defaultValue={initialQuery}
          mix={[
            css({ padding: 4 }),
            ref((node) => {
              node.select();
              requestAnimationFrame(() => {
                node.dispatchEvent(new Event("input", { bubbles: true }));
              });
            }),
          ]}
        />
      </label>
      {match(searchEvent)
        .with({ changes: P._ }, () => null)
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
          on("change", (evt) => {
            // console.log("in parent", evt.detail);
          }),
        ]}
      >
        <SearchBooksNewEventHandler initialQuery={handle.props.initialQuery} />
      </div>
    );
  },
);
