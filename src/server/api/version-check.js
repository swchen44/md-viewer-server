import express from 'express'
import { readSettings } from '../settings.js'
import { checkLatestVersion } from '../version-check.js'

// packageVersion is threaded in from createApp (see app.js), which already
// resolves it once via the __MVS_BUNDLED_VERSION__ esbuild define when
// bundled, or by reading package.json in dev (see entry.js's
// readPackageVersion()). Reusing that single resolved value here — rather
// than re-deriving it independently in this file — avoids a second copy of
// that dev-vs-bundled branching logic.
export function createVersionCheckRouter(configDir, packageVersion) {
  const router = express.Router()

  router.get('/version-check', async (req, res) => {
    const { checkForUpdates } = readSettings(configDir)
    if (!checkForUpdates) {
      // No fetch call is made at all in this branch — checkForUpdates
      // defaulting to false means a fresh install makes zero outbound
      // network calls until the user explicitly opts in, matching how
      // sendToPlantUmlServer gates the PlantUML proxy.
      return res.json({ enabled: false })
    }
    const result = await checkLatestVersion({ currentVersion: packageVersion })
    res.json({
      enabled: true,
      currentVersion: packageVersion,
      latestVersion: result?.latestVersion ?? null,
      updateAvailable: result?.updateAvailable ?? false,
    })
  })

  return router
}
