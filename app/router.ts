import { createRouter, type MiddlewareContext } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'
import { asyncActionsApiController, asyncActionsController, rootController } from './actions/controller.tsx'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'
import { compression } from 'remix/compression-middleware'

type AppContext = MiddlewareContext<[ReturnType<typeof render>]>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export const router = createRouter<AppContext>({
  middleware: [staticFiles('./public', { index: false }), compression(), render()],
})

router.map(routes, rootController)
router.map(routes.asyncActions, asyncActionsController)
router.map(routes.asyncActions.api, asyncActionsApiController)
