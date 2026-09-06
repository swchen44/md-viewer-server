import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false })

let renderCounter = 0

interface MermaidBlockProps {
  definition: string
}

export function MermaidBlock({ definition }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${renderCounter++}`)

  // Adjust state during render (React's documented pattern for resetting
  // state when a prop changes) rather than synchronously in the effect
  // below, which this repo's react-hooks/set-state-in-effect lint rule
  // flags — see OutlinePanel.tsx for the same pattern.
  const [prevDefinition, setPrevDefinition] = useState(definition)
  if (prevDefinition !== definition) {
    setPrevDefinition(definition)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    mermaid
      .render(idRef.current, definition)
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch(() => {
        if (!cancelled) setError('Diagram error: could not render this diagram.')
      })
    return () => {
      cancelled = true
    }
  }, [definition])

  return (
    <div data-testid="mermaid-block">
      {error && <p>{error}</p>}
      {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  )
}
