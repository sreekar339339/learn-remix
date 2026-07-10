import {
  clientEntry,
  css,
  Frame,
  type Handle,
  type RemixNode,
  TypedEventTarget,
  on,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { onCustomEvent } from "./utils/onCustomEvent.tsx";

type SearchEventMap = CustomEventMap<{
  queryEmpty: null;
  querySubmitted: { query: string };
}>;

function getInitialSearchDetail(
  initialQuery: string,
): SearchEventMap["change"]["detail"] {
  let detail: SearchEventMap["change"]["detail"];
  if (initialQuery) {
    detail = {
      type: "querySubmitted",
      detail: { query: initialQuery },
      details: { querySubmitted: { query: initialQuery } },
    };
  } else {
    detail = {
      type: "queryEmpty",
      detail: null,
      details: { queryEmpty: null },
    };
  }

  return detail;
}

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let initialDetail = getInitialSearchDetail(initialQuery);
    let searchTarget = new TypedEventTarget<SearchEventMap>();
    let onSearch = onCustomEvent.with({
      target: searchTarget,
      initial: { change: initialDetail },
    });

    return () => (
      <>
        <form
          action={routes.asyncActions.withFrame.index.href()}
          mix={[
            on("submit", (evt, signal) => {
              evt.preventDefault();
              let form = evt.currentTarget;
              let query = (new FormData(form).get("q") as string).trim();
              let opts = {
                target: searchTarget,
                signal,
              };
              if (!query)
                return void dispatchCustomEvent(opts, { queryEmpty: null });
              dispatchCustomEvent(opts, { querySubmitted: { query } });
            }),
          ]}
        >
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
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
                }),
                onSearch("change", (_, input) => {
                  input.select();
                }),
              ]}
            />
          </label>
        </form>
        <onSearch.change
          render={({ detail }) =>
            match(detail)
              .with({ type: "queryEmpty" }, () => (
                <p>Enter the title of any book.</p>
              ))
              .with({ type: "querySubmitted" }, ({ detail: { query } }) => (
                <Frame
                  key={query}
                  fallback={
                    <p>fetching books with title containing "{query}"...</p>
                  }
                  src={routes.asyncActions.withFrame.frame.href(undefined, {
                    q: query,
                  })}
                />
              ))
              .with({ type: P.array() }, () => null)
              .exhaustive()
          }
        />
      </>
    );
  },
);
