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
  type CustomEventMap,
  dispatchCustomEvent,
} from "./utils/customEvent.ts";

async function fetchBooks(
  query: string,
  dispatch: SearchEventMap["dispatcher"],
  signal: AbortSignal,
) {
  try {
    dispatch('search:querySubmitted', { query }, signal);
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
      return void dispatch(
        "search:booksNotFound",
        {
          reason: { other: json.detail[0].msg },
        },
        signal,
      );
    }
    let books = json.docs;
    if (!books.length) {
      return void dispatch(
        "search:booksNotFound",
        {
          reason: "emptyList",
        },
        signal,
      );
    }
    dispatch("search:booksFound", books, signal);
  } catch (error) {
    dispatch("search:errorOccurred", error as Error, signal);
  }
}

type SearchEventMap = CustomEventMap<{
  booksFound: Array<{ title: string }>;
  booksNotFound: { reason: "emptyList" | { other: string } };
  errorOccurred: Error;
  queryEmpty: null;
  querySubmitted: { query: string };
}, 'search'>;

type SeachEventTypes = SearchEventMap["types"];

declare global {
  interface HTMLElementEventMap extends SeachEventTypes {}
}

interface SearchBooksProps extends Props<"div"> {
  initialQuery: string;
}

function SearchBooksNewEventHandler(handle: Handle<SearchBooksProps>) {
  let { initialQuery } = handle.props;
  let searchEventTargetRef = (target: SearchEventMap["target"]["div"]) => {
    let dispatch = dispatchCustomEvent(target);
    
    addEventListeners(target, handle.signal, {
      "search:change"({ detail }) {
        searchEvent = detail;
        handle.update();
      },
      input(evt, signal) {
        let input = evt.target as HTMLInputElement | null;
        if (!input) return;
        const query = input.value.trim();
        if (!query) {
          return void dispatch('search:queryEmpty', signal);
        }
        fetchBooks(query, dispatch, signal);
      },
    });
  };
  let searchEvent: SearchEventMap["types"]['search:change']["detail"] = initialQuery
    ? { event: 'search:querySubmitted', detail: { query: initialQuery } }
    : { event: 'search:queryEmpty' };

  return () => (
    <div mix={[css({ display: "contents" }), ref(searchEventTargetRef)]}>
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
        .with({ event: 'search:queryEmpty' }, () => <p>Enter the title of any book.</p>)
        .with({ event: 'search:querySubmitted' }, ({detail: {query}}) => (
          <p>fetching books with title containing {query}...</p>
        ))
        .with({ event: 'search:booksFound' }, ({detail: books}) => (
          <ul>
            {books.map((book) => (
              <li>{book.title}</li>
            ))}
          </ul>
        ))
        .with({ event: 'search:booksNotFound', detail: { reason: "emptyList" } }, () => (
          <p>No books were found for this title at this time.</p>
        ))
        .with(
          {
            event: 'search:booksNotFound', detail: { reason: { other: P.select() } },
          },
          (msg) => <p>Could not fetch books for this title. Reason: {msg}.</p>,
        )
        .with({ event: 'search:errorOccurred' }, ({detail: error}) => (
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
