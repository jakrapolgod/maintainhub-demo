import jwtPlugin from '@fastify/jwt'
import fp from 'fastify-plugin'
import { config } from '../config'
// Side-effect import: registers the FastifyJWT module augmentation so
// request.user is typed as JwtPayload everywhere in the app.
import '../types/jwt'

export default fp(
  async (fastify) => {
    await fastify.register(jwtPlugin, {
      secret: config.JWT_ACCESS_SECRET,
      sign: {
        algorithm: 'HS256',
        // Default TTL applied when no explicit expiresIn is passed to jwt.sign().
        // Individual call sites may override this.
        expiresIn: config.JWT_ACCESS_TTL,
      },
    })
  },
  { name: 'jwt' },
)
