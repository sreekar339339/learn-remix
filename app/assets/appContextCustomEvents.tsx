import {
  addEventListeners,
  TypedEventTarget,
  type Handle,
  type RemixNode,
} from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

type AppContext = {
  user: { name: string; age: number } | null;
  settings: {
    theme: "dark" | "light" | "system";
    layout: "zen" | "normal";
  };
};

class AppContextEvents extends CustomEvents<
  AppContext,
  undefined,
  TypedEventTarget<CustomEvents<AppContext>["__eventMap"]>
> {}

function AppProvider(
  handle: Handle<{ children?: RemixNode }, AppContextEvents>,
) {
  let appContext = new AppContextEvents({
    target: new TypedEventTarget<AppContextEvents["__eventMap"]>(),
    initial: {
      event: {
        user: null,
        settings: { layout: "normal", theme: "system" },
      },
    },
  });
  handle.context.set(appContext);

  handle.queueTask(async (signal) => {
    // perform auth and other async stuff and dispatch context value
    await Promise.resolve();
    appContext.target.dispatchEvent(
      appContext.events(
        {
          user: { age: 23, name: "Bob Lazar" },
          settings: { layout: "zen", theme: "light" },
        },
        { signal },
      ),
    );
  });

  return () => <body>{handle.props.children}</body>;
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext.target, handle.signal, {
    user() {
      handle.update();
    },
  });

  return () => (
    <div>{appContext.latest?.events.user?.name ?? "Not logged in"}</div>
  );
}

// Event components can display context values without calling handle.update().
function EventUserDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.user
      render={({ detail }) => <div>{detail?.name ?? "Not logged in"}</div>}
    />
  );
}

function SettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  addEventListeners(appContext.target, handle.signal, {
    settings() {
      handle.update();
    },
  });

  return () => (
    <div>
      <pre>
        Layout: {appContext.latest?.events.settings?.layout}, Theme:{" "}
        {appContext.latest?.events.settings?.theme}
      </pre>
    </div>
  );
}

function EventSettingsDisplay(handle: Handle) {
  let appContext = handle.context.get(AppProvider);

  return () => (
    <appContext.settings
      render={({ detail }) => (
        <div>
          <pre>
            Layout: {detail.layout}, Theme: {detail.theme}
          </pre>
        </div>
      )}
    />
  );
}
