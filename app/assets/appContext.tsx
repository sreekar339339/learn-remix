import {
  addEventListeners,
  TypedEventTarget,
  type Handle,
  type RemixNode,
} from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";

type AppContext = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

type AppContextEventMap = CustomEventMap<AppContext>

function AppProvider(
  handle: Handle<
    { children?: RemixNode },
    { target: TypedEventTarget<AppContextEventMap>; appContext: AppContext }
  >,
) {
  let appContext: AppContext = {
    user: null,
    settings: { layout: "normal", theme: "dark" },
  };
  let target = new TypedEventTarget<AppContextEventMap>;

  handle.context.set({
    appContext,
    target,
  });

  addEventListeners(target, handle.signal, {
    change({ detail }) {
      if ("changes" in detail) {
        Object.assign(appContext, detail.changes);
      } else {
        Object.assign(appContext, { [detail.type]: detail.detail });
      }
    },
  });

  handle.queueTask(async (signal) => {
    // perform auth and other async stuff and dispatch context value
    await Promise.resolve();
    dispatchCustomEvent(target, signal, "change", {
      changes: {
        user: { age: 23, name: "Bob Lazar" },
        settings: { layout: "zen", theme: "light" },
      },
    });
  })

  return () => (
    <body>{handle.props.children}</body>
  );
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let provider = handle.context.get(AppProvider);
  let context = provider.appContext;

  addEventListeners(provider.target, handle.signal, {
    user() {
      handle.update();
    },
  });

  return () => <div>{context.user?.name ?? "Not logged in"}</div>;
}

function SettingsDisplay(handle: Handle) {
  let provider = handle.context.get(AppProvider);
  let context = provider.appContext;

  addEventListeners(provider.target, handle.signal, {
    settings() {
      handle.update();
    },
  });

  return () => (
    <div>
      <pre>Layout: {context.settings.layout}, Theme: {context.settings.theme}</pre>
    </div>
  );
}
