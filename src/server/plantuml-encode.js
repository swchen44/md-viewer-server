import zlib from 'node:zlib'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

function encode6bit(value) {
  return ALPHABET[value & 0x3f]
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4)
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6)
  const c4 = b3 & 0x3f
  return encode6bit(c1) + encode6bit(c2) + encode6bit(c3) + encode6bit(c4)
}

function encode64(data) {
  let result = ''
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      result += append3bytes(data[i], data[i + 1], 0)
    } else if (i + 1 === data.length) {
      result += append3bytes(data[i], 0, 0)
    } else {
      result += append3bytes(data[i], data[i + 1], data[i + 2])
    }
  }
  return result
}

export function encodePlantUmlText(diagramSource) {
  const utf8Bytes = Buffer.from(diagramSource, 'utf-8')
  const compressed = zlib.deflateRawSync(utf8Bytes, { level: 9 })
  return encode64(compressed)
}
