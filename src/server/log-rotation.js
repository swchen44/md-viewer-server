import fs from 'node:fs'

export function createRotatingStream(filePath, { maxBytes = 10 * 1024 * 1024, maxFiles = 3 } = {}) {
  let currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  let fd = fs.openSync(filePath, 'a')

  function rotate() {
    fs.closeSync(fd)
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = `${filePath}.${i}`
      if (fs.existsSync(src)) {
        const dest = `${filePath}.${i + 1}`
        if (i + 1 > maxFiles) {
          fs.unlinkSync(src)
        } else {
          fs.renameSync(src, dest)
        }
      }
    }
    fs.renameSync(filePath, `${filePath}.1`)
    fd = fs.openSync(filePath, 'a')
    currentSize = 0
  }

  return {
    write(chunk) {
      const buf = Buffer.from(chunk)
      if (currentSize > 0 && currentSize + buf.length > maxBytes) {
        rotate()
      }
      fs.writeSync(fd, buf)
      currentSize += buf.length
      return true
    },
  }
}
