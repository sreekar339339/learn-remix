import {
  clientEntry,
  css,
  Frame,
  addEventListeners,
  ref,
  type Handle,
} from "remix/ui";
import { routes } from "../routes.ts";
import { match, P } from "ts-pattern";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { getInput } from "./utils/dom.ts";

type SearchWithFrameEventMap = CustomEventMap<{
  queryEmpty: null;
  querySubmitted: { query: string };
}, { namespace: "searchWithFrame" }>;

declare global {
  type SeachEventTypes = SearchWithFrameEventMap["namespacedEvents"];
  interface HTMLElementEventMap extends SeachEventTypes {}
}

export const SearchBooksWithFrame = clientEntry(
  import.meta.url,
  function SearchBooksWithFrame(handle: Handle<{ initialQuery?: string }>) {
    let initialQuery = handle.props.initialQuery?.trim() || "";

    let searchEventTargetRef = (target: HTMLDivElement) => {
      addEventListeners(target, handle.signal, {
        submit(evt, signal) {
          evt.preventDefault();
          let dispatch = dispatchCustomEvent(target, signal);
          let form = evt.target as HTMLFormElement;
          let query = (new FormData(form).get("q") as string).trim();
          if (!query) return void dispatch("search:queryEmpty");
          dispatch("search:querySubmitted", { query });
          getInput(form)?.select();
        },
        "searchWithFrame:change"(evt) {
          searchEvent = evt.detail;
          handle.update();
        },
      });
    };

    let searchEvent: SearchWithFrameEventMap["events"]["change"]["detail"] = initialQuery
    ? {
        type: 'querySubmitted',
        detail: { query: initialQuery },
      }
    : { type: 'queryEmpty' };

    return () => (
      <div mix={[css({ display: "contents" }), ref(searchEventTargetRef)]}>
        <form action={routes.asyncActions.withFrame.index.href()}>
          <label>
            Search{" "}
            <input
              name="q"
              type="text"
              defaultValue={initialQuery}
              mix={[
                css({ padding: 4 }),
                ref((node) => {
                  node.select();
                }),
              ]}
            />
          </label>
        </form>
        {match(searchEvent)
          .with({ changes: P._ }, () => null)
          .with({ type: 'queryEmpty' }, () => <p>Enter the title of any book.</p>)
          .with({ type: 'querySubmitted' }, ({detail: {query}}) => (
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
      </div>
    );
  },
);
