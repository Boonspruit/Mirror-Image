import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { createSixSevenDetector } from '../tracking/sixSevenGesture.ts'

export default function SixSevenOverlay({ ref, active, onReveal }) {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const detector=useRef(createSixSevenDetector())
  const revealed=useRef(false)
  const notify=useCallback((visible: boolean)=>{
    if (revealed.current!==visible) { revealed.current=visible; onReveal(visible) }
  },[onReveal])
  useImperativeHandle(ref,()=>({
    clear() {
      detector.current.reset()
      notify(false)
      const canvas=canvasRef.current
      canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height)
    },
    observe(hands, width: number, height: number, now: number, worldHands?) {
      const canvas=canvasRef.current
      if (!active || !canvas || width<=0 || height<=0) return
      if (canvas.width!==width || canvas.height!==height) {
        detector.current.reset()
        canvas.width=width; canvas.height=height
      }
      detector.current.update(hands,now,width/height,worldHands)

    },
  }),[active,notify])
  useEffect(()=>{
    detector.current.reset()
    const motion=createSixSevenDetector()
    detector.current=motion
    let frame=0
    const canvas=canvasRef.current, context=canvas?.getContext('2d')
    if (!canvas || !context) return
    const draw=()=>{
      // rAF's frame-start timestamp can precede a tracker reading in the same frame.
      const now=performance.now()
      context.clearRect(0,0,canvas.width,canvas.height)
      const state=motion.snapshot(now)
      notify(state.active)
      canvas.dataset.visible=state.labels.length?'true':'false'
      if (state.labels.length) {
        const size=Math.min(canvas.width,canvas.height)*.13
        context.save()
        context.globalAlpha=state.opacity
        context.font=`800 ${size}px system-ui, sans-serif`
        context.textAlign='center'; context.textBaseline='middle'
        context.lineJoin='round'; context.lineWidth=size*.12
        context.strokeStyle='#fff'; context.fillStyle='#1b5945'
        for (const label of state.labels) {
          context.globalAlpha=state.opacity*label.opacity
          const margin=size*.65
          // Mirror the coordinates, rather than the canvas, so digits read normally.
          const x=Math.max(margin,Math.min(canvas.width-margin,(1-label.x)*canvas.width))
          const y=Math.max(margin,Math.min(canvas.height-margin,label.y*canvas.height))
          context.strokeText(label.digit,x,y); context.fillText(label.digit,x,y)
        }
        context.restore()
      }
      frame=requestAnimationFrame(draw)
    }
    if (active) frame=requestAnimationFrame(draw)
    else { notify(false); context.clearRect(0,0,canvas.width,canvas.height); canvas.dataset.visible='false' }
    return ()=>{ cancelAnimationFrame(frame); motion.reset(); notify(false); context.clearRect(0,0,canvas.width,canvas.height) }
  },[active,notify])
  return <canvas ref={canvasRef} className="six-seven-overlay" hidden={!active} aria-hidden="true" />
}
