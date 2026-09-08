import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PlantUmlView } from '../../src/frontend/components/PlantUmlView.js'

describe('PlantUmlView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows raw source and a hint when sendToServer is false', () => {
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={false} />)
    expect(screen.getByText(/@startuml/)).toBeInTheDocument()
    expect(screen.getByText(/settings/i)).toBeInTheDocument()
  })

  it('fetches and renders the diagram image when sendToServer is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['fake-png-bytes']), { headers: { 'Content-Type': 'image/png' } })
      )
    )
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={true} />)
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
  })

  it('shows an error message if the proxy call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 502 })))
    render(<PlantUmlView source="@startuml\nA -> B\n@enduml" sendToServer={true} />)
    await waitFor(() => expect(screen.getByText(/error|failed/i)).toBeInTheDocument())
  })
})
