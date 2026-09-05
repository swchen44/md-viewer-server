export function createAuthMiddleware(config) {
  return function authMiddleware(req, res, next) {
    const token = req.header('X-Auth-Token')
    if (token !== config.token) {
      res.status(401).json({ errorCode: 'UNAUTHORIZED' })
      return
    }
    next()
  }
}
