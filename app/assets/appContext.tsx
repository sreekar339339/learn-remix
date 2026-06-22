import { addEventListeners, css, on, type Handle, type RemixNode } from "remix/ui";
import { SemanticEventTarget } from "./utils/SemanticEventTarget.js";

type User = {name: string, age: number} | null
type Settings = {theme: 'dark' | 'light' | 'system', layout: 'zen' | 'normal'}
type AppContext = {user: User, settings: Settings}

// class AppContext extends SemanticEventTarget<{
//   user: User,
//   settings: Settings
// }> {
//   #user: User = null
//   #settings: Settings = {theme: 'system', layout: 'normal'}

//   get user() {
//     return this.#user
//   }

//   get settings() {
//     return this.#settings
//   }

  // setUser(user: User | null) {
  //   this.#user = user
  //   this.dispatchEvent(new Event('userChange'))
  // }

  // setSettings(settings: Settings) {
  //   this.#settings = settings
  //   this.dispatchEvent(new Event('settingsChange'))
  // }
// }

function AppProvider(handle: Handle<{ children?: RemixNode }, SemanticEventTarget<AppContext>>) {
  let appContext = new SemanticEventTarget<AppContext>({
    state: {settings: {theme: 'dark', layout: 'normal'}, user: {age: 24, name: 'faggot'}}
  })
  handle.context.set(appContext)

  return () => handle.props.children
}

// Components can subscribe to only the events they care about
function UserDisplay(handle: Handle) {
  let context = handle.context.get(AppProvider)

  addEventListeners(context, handle.signal, {
    userChange() {
      handle.update()
    },
  })

  return () => <div>{context.state.user?.name ?? 'Not logged in'}</div>
}

type Theme = {
  value: 'light' | 'dark'
}

// class Theme extends SemanticEventTarget<{value: ThemeValue}> {
//   #value: 'light' | 'dark' = 'light'

//   get value() {
//     return this.#value
//   }
// }

function ThemeProvider(handle: Handle<{ children?: RemixNode }, SemanticEventTarget<Theme>>) {
  let themeEvtTarget = new SemanticEventTarget<Theme>({
    state: {value: 'dark'}
  })
  handle.context.set(themeEvtTarget)

  return () => (
    <div>
      <button
        mix={[
          on('click', () => {
            // No update needed - consumers subscribe to changes
            themeEvtTarget.dispatchEvent('valueChange', themeEvtTarget.state.value === 'light' ? 'dark' : 'light')
          }),
        ]}
      >
        Toggle Theme
      </button>
      {handle.props.children}
    </div>
  )
}

function ThemedContent(handle: Handle) {
  let theme = handle.context.get(ThemeProvider)

  // Subscribe to granular updates
  addEventListeners(theme, handle.signal, {
    change() {
      handle.update()
    },
  })

  return () => (
    <div mix={[css({ backgroundColor: theme.state.value === 'dark' ? '#000' : '#fff' })]}>
      Current theme: {theme.state.value}
    </div>
  )
}