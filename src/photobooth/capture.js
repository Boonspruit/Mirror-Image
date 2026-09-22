export function memeImageUrl(path) {
  return /^(data:|blob:)/.test(path) ? path : import.meta.env.BASE_URL + path.replace(/^\//, '')
}

function contain(context, source, width, height, x, y, boxWidth, boxHeight) {
  const scale = Math.min(boxWidth / width, boxHeight / height)
  context.drawImage(source, x + (boxWidth - width * scale) / 2, y + (boxHeight - height * scale) / 2, width * scale, height * scale)
}

// Freeze the video immediately; decoding the meme must not delay the shutter.
export async function captureComparison(video, meme) {
  if (!video || video.readyState < 2 || !video.videoWidth) throw new Error('The camera is not ready. Try again when your preview appears.')
  const photo = document.createElement('canvas')
  photo.width = video.videoWidth
  photo.height = video.videoHeight
  const photoContext = photo.getContext('2d')
  photoContext.translate(photo.width, 0)
  photoContext.scale(-1, 1)
  photoContext.drawImage(video, 0, 0)

  const image = new Image()
  image.src = memeImageUrl(meme.image)
  try { await image.decode() } catch { throw new Error('The meme image could not load. Choose another meme or try again.') }
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 760
  const context = canvas.getContext('2d')
  context.fillStyle = '#f6f7f2'
  context.fillRect(0, 0, 1600, 760)
  context.fillStyle = '#222a25'
  context.font = '600 28px sans-serif'
  context.fillText('mirror image.', 40, 56)
  context.font = '24px sans-serif'
  context.fillText(meme.name, 40, 714, 1480)
  context.fillStyle = '#e8ecdf'
  context.fillRect(40, 90, 740, 555)
  context.fillRect(820, 90, 740, 555)
  contain(context, photo, photo.width, photo.height, 40, 90, 740, 555)
  contain(context, image, image.naturalWidth, image.naturalHeight, 820, 90, 740, 555)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The photo could not be created. Please retake it.')), 'image/png'))
}
