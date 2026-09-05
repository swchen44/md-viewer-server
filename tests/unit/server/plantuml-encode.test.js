import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { encodePlantUmlText } from '../../../src/server/plantuml-encode.js'

describe('encodePlantUmlText', () => {
  it('produces a non-empty string for simple diagram source', () => {
    const result = encodePlantUmlText('@startuml\nAlice -> Bob\n@enduml')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('only uses characters from PlantUML\'s 64-character alphabet', () => {
    const result = encodePlantUmlText('@startuml\nAlice -> Bob: hello\n@enduml')
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces different output for different input', () => {
    const a = encodePlantUmlText('@startuml\nA -> B\n@enduml')
    const b = encodePlantUmlText('@startuml\nB -> C\n@enduml')
    expect(a).not.toBe(b)
  })

  it('is deterministic (same input produces same output)', () => {
    const source = '@startuml\nfoo -> bar\n@enduml'
    expect(encodePlantUmlText(source)).toBe(encodePlantUmlText(source))
  })

  it('round-trips through raw deflate decompression back to the original bytes', () => {
    // Verifies the encoding is actually a valid deflate+custom-base64 pipeline,
    // not just an opaque hash — decode the custom alphabet back to bytes,
    // inflate, and confirm we get the original UTF-8 text back.
    const source = '@startuml\nAlice -> Bob: Authentication Request\n@enduml'
    const encoded = encodePlantUmlText(source)

    const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
    const sixBitValues = [...encoded].map((ch) => ALPHABET.indexOf(ch))
    const bytes = []
    for (let i = 0; i + 3 < sixBitValues.length + 1; i += 4) {
      const [c1, c2, c3, c4] = [
        sixBitValues[i] ?? 0,
        sixBitValues[i + 1] ?? 0,
        sixBitValues[i + 2] ?? 0,
        sixBitValues[i + 3] ?? 0,
      ]
      bytes.push((c1 << 2) | (c2 >> 4))
      bytes.push(((c2 & 0xf) << 4) | (c3 >> 2))
      bytes.push(((c3 & 0x3) << 6) | c4)
    }
    const compressed = Buffer.from(bytes)
    const inflated = zlib.inflateRawSync(compressed)
    expect(inflated.toString('utf-8').startsWith(source)).toBe(true)
  })
})
