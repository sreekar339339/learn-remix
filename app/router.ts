import { createRouter, type MiddlewareContext } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'
import { asyncActionsWithFrameController, asyncActionsWithoutFrameApiController, asyncActionsWithoutFrameController, rootController, todolistController, todosCrudController } from './actions/controller.tsx'
import { render } from './middleware/render.tsx'
import { routes } from './routes.ts'
import { formData } from 'remix/form-data-middleware'

type AppContext = MiddlewareContext<[
  ReturnType<typeof formData>,
  ReturnType<typeof render>
]>

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext
  }
}

export const router = createRouter<AppContext>({
  middleware: [staticFiles('./public', { index: false }), formData(), render()]
})

router.map(routes, rootController)
router.map(routes.asyncActions.withoutFrame, asyncActionsWithoutFrameController)
router.map(routes.asyncActions.withoutFrame.api, asyncActionsWithoutFrameApiController)
router.map(routes.asyncActions.withFrame, asyncActionsWithFrameController)
router.map(routes.todolist, todolistController)
router.map(routes.todolist.todos, todosCrudController)
