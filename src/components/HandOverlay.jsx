import { useEffect, useImperativeHandle, useRef } from 'react'
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision'

export default function HandOverlay({ ref, enabled }) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    },
    draw(hands, width, height) {
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!enabled || !hands?.length) return

      const drawing = new DrawingUtils(context)
      const scale = width / 640
      for (const landmarks of hands) {
        drawing.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS,
          { color: '#f6c86f', lineWidth: 2 * scale })
        drawing.drawLandmarks(landmarks,
          { color: '#fff7df', fillColor: '#d88f38', lineWidth: scale, radius: 2.5 * scale })
      }
    },
  }), [enabled])

  useEffect(() => {
    if (!enabled) {
      const canvas = canvasRef.current
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [enabled])

  return <canvas ref={canvasRef} className="hand-overlay" hidden={!enabled} aria-hidden="true" />
}
