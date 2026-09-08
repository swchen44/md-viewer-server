import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api-client.js'

interface PlantUmlViewProps {
  source: string
  sendToServer: boolean
}

// `.puml`/`.plantuml` files render through this single mode regardless of the
// tab's view/edit/split setting (see TabContent) — there is no "edit source
// while previewing" split for diagrams, so this component has no mode prop.
export function PlantUmlView({ source, sendToServer }: PlantUmlViewProps) {
  const { t } = useTranslation()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!sendToServer) return
    let cancelled = false
    let objectUrl: string | null = null
    apiFetch('/api/plantuml-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    })
      .then(async (res) => {
        // The proxy already enforces sendToPlantUmlServer/privacy mode
        // server-side (403 PLANTUML_DISABLED) and reports upstream failures
        // (502 PLANTUML_UNREACHABLE); this view doesn't duplicate that
        // logic, it just falls back to a plain error state for any non-ok
        // response so a disabled or unreachable server never crashes the
        // pane or leaves it blank.
        if (!res.ok) throw new Error('proxy failed')
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, sendToServer])

  if (!sendToServer) {
    return (
      <div>
        <pre>{source}</pre>
        <p>
          {t(
            'plantumlView.disabledHint',
            'Enable "Send diagram source to PlantUML server" in Settings and specify a server to render this diagram.'
          )}
        </p>
      </div>
    )
  }

  if (error) {
    return <p>{t('plantumlView.error', 'Failed to render this PlantUML diagram.')}</p>
  }

  if (!imageUrl) {
    return <p>{t('plantumlView.loading', 'Rendering...')}</p>
  }

  return <img src={imageUrl} alt={t('plantumlView.imageAlt', 'Rendered PlantUML diagram')} />
}
