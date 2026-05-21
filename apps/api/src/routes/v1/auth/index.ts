import type { FastifyPluginAsync } from 'fastify'
import forgotPasswordRoute from './forgot'
import loginRoute from './login'
import logoutRoute from './logout'
import refreshRoute from './refresh'
import registerRoute from './register'
import resetPasswordRoute from './reset'

/** Groups all auth routes under a shared prefix. */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  void fastify.register(registerRoute)
  void fastify.register(loginRoute)
  void fastify.register(refreshRoute)
  void fastify.register(logoutRoute)
  void fastify.register(forgotPasswordRoute)
  void fastify.register(resetPasswordRoute)
}

export default authRoutes
