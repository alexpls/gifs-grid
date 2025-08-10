const fps = 60
const gifHeight = 60
const maxWidth = 1920
const padding = 8
const panSpeed = 0.5 // px per frame

let gifsData

const maxConcurrentDownloads = 10
let activeDownloads = 0
let downloadQueue = []

let panX = 0
let grid = { rows: [] }
let totalRowsHeight = 0
let gridOffsetY = 0

const starDensity = 1000
const maxStars = 2000
let stars = []

let crt
let renderBuffer

function preload() {
  const params = getURLParams()
  let safe = true
  if (params.safe === "no") {
    safe = false // loads gifs image classifiers think are nsfw
  }

  // TODO: load gif urls in chunks rather than all at once, or...
  // rethink gif loading to avoid having to load these URLs upfront at all.
  // We could call an API like "api/random_gif" and get redirected
  // to a gif url of the backend's choosing. That'd let us move some
  // skipping logic serverside and if we get redirected to canonical URL
  // could still take advantage of CDN caching.
  gifsData = loadJSON(`/api/gifs?n=10000&safe=${safe ? 'yes' : 'no'}`)
}

function initRenderBuffer() {
  // constrain width - if we show too many gifs at once
  // we run into perf issues and need to call lambo to borrow
  // his 5090.
  const bw = min(windowWidth, maxWidth)
  const s = windowWidth / bw
  const bh = Math.floor(windowHeight / s)
  renderBuffer = createGraphics(bw, bh, WEBGL)
  renderBuffer.pixelDensity(1) // TODO: be nicer to high dpi screens?

  const params = getURLParams()
  if (params.shader !== 'no') {
    crt = renderBuffer.createFilterShader(crtShaderSrc)
  }
}

function initializeGrid() {
  grid.rows = []
  totalRowsHeight = 0

  const targetHeight = renderBuffer.height
  while (totalRowsHeight < targetHeight) {
    const rowHeight = gifHeight + random(0, 50)
    totalRowsHeight += rowHeight + padding
    grid.rows.push(makeRow(rowHeight))
  }
  totalRowsHeight -= padding
  gridOffsetY = (targetHeight - totalRowsHeight) / 2

  console.log('grid initialized', { numRows: grid.rows.length })
}

function initializeStars() {
  stars = []

  const targetWidth = renderBuffer.width
  const targetHeight = renderBuffer.height

  const numStars = Math.floor(Math.min((targetHeight * targetWidth) / starDensity, maxStars))
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: random(-targetWidth / 2, targetWidth / 2),
      y: random(-targetHeight / 2, targetHeight / 2),
      size: random(0.5, 3),
      speed: random(0.1, 0.5)
    })
  }

  console.log('stars initialized', { numStars })
}

function setup() {
  frameRate(fps)
  createCanvas(windowWidth, windowHeight)

  initRenderBuffer()
  initializeGrid()
  initializeStars()
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)

  initRenderBuffer()
  initializeGrid()
  initializeStars()
}

function draw() {
  panX += panSpeed

  renderBuffer.background('black')

  // stars
  renderBuffer.push()
  renderBuffer.stroke(255, 255, 255, 150)
  renderBuffer.strokeWeight(2)
  renderBuffer.beginShape(POINTS)
  stars.forEach(star => {
    star.x -= star.speed

    if (star.x < -renderBuffer.width / 2) {
      star.x = renderBuffer.width / 2
      star.y = random(-renderBuffer.height / 2, renderBuffer.height / 2)
    }

    renderBuffer.vertex(star.x, star.y)
  })
  renderBuffer.endShape()
  renderBuffer.pop()

  grid.rows.forEach((row, rowIdx) => {
    const rowPanX = panX * row.speedMul

    if (row.offsetX + rowWidth(row) < (renderBuffer.width + rowPanX)) {
      rowLoadNextCell(row)
      rowRemoveOffscreenCells(row, rowPanX)
    }

    let y = 0
    let x = 0

    for (let i = 0; i < rowIdx; i++) {
      y += grid.rows[i].height + padding
    }

    renderBuffer.push()
    renderBuffer.translate(-rowPanX - (renderBuffer.width / 2), gridOffsetY - (renderBuffer.height / 2))
    row.cells.forEach(cell => {
      if (cell.loadTime) {
        const elapsed = millis() - cell.loadTime
        cell.opacity = min(255, (elapsed / 200) * 255)
      }

      // perf: stop drawing tint once cell opaque
      renderBuffer.push()
      renderBuffer.tint(255, cell.opacity)
      renderBuffer.image(cell.img, row.offsetX + x, y, cell.width, cell.height)
      renderBuffer.pop()

      x += cell.width + padding
    })
    renderBuffer.pop()
  })

  if (crt) {
    renderBuffer.filter(crt)
  }

  // draw the scaled buffer back to the main canvas
  // perf: scaling on the main canvas and avoiding buffer
  // altogether would save an expensive draw. hmm...
  background('black')
  imageMode(CORNER)
  image(renderBuffer, 0, 0, width, height)
}

function rowRemoveOffscreenCells(row, rowPanX) {
  let x = 0
  let cellsToRemove = 0

  for (let i = 0; i < row.cells.length; i++) {
    const cell = row.cells[i]
    const cellRight = row.offsetX + x + cell.width

    if (cellRight < rowPanX) {
      cellsToRemove++
      row.offsetX += cell.width + padding
    } else {
      break
    }

    x += cell.width + padding
  }

  if (cellsToRemove > 0) {
    row.cells.splice(0, cellsToRemove)
  }
}

function rowLoadNextCell(row) {
  if (row.loadingCell) {
    return
  }

  const gif = random(gifsData.urls)
  if (!gif) {
    return // the backend didn't return any gifs
  }

  row.loadingCell = makeCell(
    gif,
    row.height,
    _ => row.loadingCell = null,
    img => {
      const r = img.width / img.height
      row.loadingCell.img = img
      row.loadingCell.width = Math.floor(row.height * r)
      row.cells.push(row.loadingCell)
      row.loadingCell = null
    },
    _ => {
      console.warn("failed to load gif", gif)
      row.loadingCell = null
    }
  )
}

function rowWidth(row) {
  // perf: could be cached
  return row.cells.reduce((sum, c, idx) => sum + c.width + (idx > 0 ? padding : 0), 0)
}

function makeRow(height) {
  return {
    cells: [],
    height: height,
    offsetX: 0,
    loadingCell: null,
    speedMul: random(1, 2.5) // some rows pan faster than others
  }
}

function makeCell(url, height, onSkip, onLoad, onError) {
  const cell = {
    width: 0,
    height: height,
    img: null,
    opacity: 0,
    loadTime: null
  }

  // perf: move skipping serverside

  // skip 50% of "sign my guestbook" gifs
  if (url.includes("guestbook") && random() > 0.5) {
    onSkip()
    return
  }

  // skip 50% of "new" gifs
  if (url.includes("new") && random() > 0.5) {
    onSkip()
    return
  }

  downloadQueue.push({
    url: url,
    onLoad: img => {
      const ratio = img.width / img.height
      if (
        (ratio > 3 && random() > 0.2) || // skip 80% of long gifs
        (ratio > 4 && random() > 0.1)    // skip 90% of looooong gifs
      ) {
        onSkip()
        return
      }
      cell.loadTime = millis()
      onLoad(img)
    },
    onError: onError
  })

  processDownloadQueue()

  return cell
}

function processDownloadQueue() {
  while (activeDownloads < maxConcurrentDownloads && downloadQueue.length > 0) {
    const task = downloadQueue.shift()
    activeDownloads++

    loadImage(task.url,
      img => {
        activeDownloads--
        task.onLoad(img)
        processDownloadQueue()
      },
      err => {
        activeDownloads--
        task.onError(err)
        processDownloadQueue()
      }
    )
  }
}


// https://babylonjs.medium.com/retro-crt-shader-a-post-processing-effect-study-1cb3f783afbc
const crtShaderSrc = `
precision highp float;

uniform sampler2D tex0;
varying vec2 vTexCoord;

vec2 curveRemapUV(vec2 uv) {
  // as we near the edge of our screen apply greater distortion using a cubic function    
  uv = 2.0 * uv - 1.0;
  vec2 curvature = vec2(6.0);
  vec2 offset = abs(uv.yx) / curvature;
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

vec4 adjBrightness(vec2 inUV, vec4 clr) {
  float r = 0.5;
  vec2 cornerUV = min(2.0 * (0.5 - abs(inUV - vec2(0.5))) + r, 1.0);
  float br = cornerUV.x * cornerUV.y + 0.15;
  br = pow(cornerUV.x * cornerUV.y, 2.2) + 0.45;
  br = clamp(br * br * br * br + 0.55, 0.0, 1.0);
  return clr * br;
}

void main() {
  vec2 remappedUV = curveRemapUV(vTexCoord);
  vec4 baseColor = texture2D(tex0, remappedUV);
  if (remappedUV.x < 0.0 || remappedUV.y < 0.0 || remappedUV.x > 1.0 || remappedUV.y > 1.0){
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    gl_FragColor = adjBrightness(vTexCoord, baseColor);
  }

  gl_FragColor *= abs(sin(remappedUV.y * 1024.0));
  gl_FragColor.a = 1.0;
}
`;

