import { useEffect, useImperativeHandle, useRef } from 'react'
import { DrawingUtils, FaceLandmarker } from '@mediapipe/tasks-vision'

// A small imperative interface lets the tracking loop paint each result without
// putting hundreds of landmark coordinates into React state on every frame.
export default function FaceOverlay({ ref, enabled }) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    },
    draw(landmarks, width, height) {
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      // Match the camera's intrinsic dimensions. CSS applies the same contain
      // fit and mirroring to both layers, including any letterboxing.
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!enabled || !landmarks?.length) return

      const drawing = new DrawingUtils(context)
      const scale = width / 640
      drawing.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: 'rgba(213, 245, 178, 0.3)', lineWidth: 0.6 * scale })
      drawing.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_CONTOURS,
        { color: '#d5f5b2', lineWidth: 1.4 * scale })
      drawing.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        { color: '#ffffff', lineWidth: 1.2 * scale })
      drawing.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        { color: '#ffffff', lineWidth: 1.2 * scale })
    },
  }), [enabled])

  useEffect(() => {
    if (!enabled) {
      const canvas = canvasRef.current
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [enabled])

  // Decorative: the camera's accessible tracking status conveys detection.
  return <canvas ref={canvasRef} className="face-overlay" hidden={!enabled} aria-hidden="true" />
}
