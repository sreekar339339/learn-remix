import {
  clientEntry,
  css,
  Frame,
  addEventListeners,
  ref,
  type Handle,
  TypedEventTarget,
  on,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match } from "ts-pattern";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";

type SearchEventMap = CustomEventMap<{
  queryEmpty: null;
  querySubmitted: { query: string };
}>;

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let searchTarget = new TypedEventTarget<SearchEventMap>();
    addEventListeners(searchTarget, handle.signal, {
      change({ detail: { event } }) {
        searchEvent = event;
        handle.update();
      },
    });
    let initialQuery = handle.props.initialQuery?.trim() || "";
    let searchEvent: SearchEventMap["change"]["detail"]["event"] = initialQuery
      ? {
          type: "querySubmitted",
          detail: { query: initialQuery },
        }
      : { type: "queryEmpty" };

    return () => (
      <>
        <form
          action={routes.asyncActions.withFrame.index.href()}
          mix={on("submit", (evt, signal) => {
            evt.preventDefault();
            let form = evt.currentTarget;
            let query = (new FormData(form).get("q") as string).trim();
            if (query === searchEvent?.detail?.query) return;
            let dispatch = dispatchCustomEvent(searchTarget, signal);
            if (!query) return void dispatch("queryEmpty");
            dispatch("querySubmitted", { query });
          })}
        >
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
              mix={[
                css({ padding: 4 }),
                ref((node, signal) => {
                  addEventListeners(searchTarget, signal, {
                    querySubmitted() {
                      node.select();
                    },
                  });
                }),
              ]}
            />
          </label>
        </form>
        {match(searchEvent)
          .with({ type: "queryEmpty" }, undefined, () => (
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
          .exhaustive()}
      </>
    );
  },
);
