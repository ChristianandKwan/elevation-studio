'use client'

import { useRef } from 'react'
import type { useStudio } from '@/hooks/useStudio'
import { ArcSpinner } from '@/components/ui/Spinner'

type StudioHook = ReturnType<typeof useStudio>

interface Props {
  studio: StudioHook
  onStatus: (msg: string) => void
  clientPickedOption?: string | null
  activeOption?: string
}

export default function StudioCanvas({ studio, onStatus, clientPickedOption, activeOption }: Props) {
  const { state, elevWrapRef, calibSvgRef, fgDrawSvgRef, vpRef, changeZoom, setZoomFit } = studio
  const elevImgRef = useRef<HTMLImageElement>(null)

  // Deselect on canvas background click (skip if a box-select drag just finished)
  function onWrapClick(e: React.MouseEvent) {
    if (state.skewAdjustMode) return // handled by onWrapMouseDown
    if (studio.boxSelectedRef.current) return
    const target = e.target as HTMLElement
    const isBackground = target.id === 'elev-img' || target.id === 'artwork-layer' || target === elevWrapRef.current
    if (isBackground) {
      studio.selectArtwork(null)
    }
  }

  const hasElev = !!state.elev

  return (
    <div className="canvas-area" id="canvas-area">
      {!hasElev && (
        <div className="canvas-empty">
          <div className="empty-icon">🖼</div>
          <p>Upload an elevation to begin</p>
        </div>
      )}

      {hasElev && (
        <div
          className="canvas-viewport"
          id="canvas-viewport"
          ref={vpRef}
        >
          <div className="canvas-scroller">
            <div
              className="elev-wrap"
              id="elev-wrap"
              ref={elevWrapRef}
              onMouseDown={clientPickedOption && activeOption && clientPickedOption === activeOption ? undefined : studio.onWrapMouseDown}
              onMouseMove={state.skewDefMode ? studio.onWrapMouseMove : undefined}
              onClick={onWrapClick}
              style={(state.skewDefMode || state.skewAdjustMode) ? { cursor: 'crosshair' } : { cursor: clientPickedOption && activeOption && clientPickedOption === activeOption ? 'default' : undefined }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="elev-img"
                className="elev-img"
                src={state.elev?.imageUrl ?? ''}
                alt="elevation"
                draggable={false}
                ref={elevImgRef}
              />

              {/* Foreground composite SVG — sits above artwork overlays, renders elevation clipped to mask polygons */}
              <svg
                id="fg-svg"
                className="fg-svg"
                style={{ display: 'none' }}
              >
                <defs>
                  <clipPath id="fg-clip" />
                </defs>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <image
                  id="fg-image"
                  href=""
                  x="0"
                  y="0"
                  preserveAspectRatio="none"
                  clipPath="url(#fg-clip)"
                  style={{ pointerEvents: 'none' }}
                />
              </svg>

              {/* Foreground drawing SVG — active only when mask draw mode is on */}
              <svg
                id="fg-draw-svg"
                className="fg-draw-svg"
                ref={fgDrawSvgRef}
                onMouseMove={studio.onMaskMouseMove}
                onClick={studio.onMaskClick}
                onDoubleClick={studio.onMaskDblClick}
              />

              {/* Foreground highlight SVG — shows individual region on sidebar hover */}
              <svg
                id="fg-highlight-svg"
                className="fg-highlight-svg"
                style={{ display: 'none' }}
              />

              {/* Calibration hint */}
              <div className="calib-hint" id="calib-hint">
                Click and drag to draw a scale line
              </div>

              {/* Mask draw hint */}
              <div className="calib-hint mask-hint" id="mask-hint">
                Click to place points · Double-click or click the first point to close the shape · Esc to cancel
              </div>

              {/* Calibration SVG */}
              <svg
                className="calib-svg"
                id="calib-svg"
                ref={calibSvgRef}
                onMouseDown={studio.onCalibMouseDown}
                onMouseMove={studio.onCalibMouseMove}
                onMouseUp={studio.onCalibMouseUp}
              >
                <line id="rl-bg" style={{ display: 'none' }} />
                <line id="rl"    className="calib-ruler"    display="none" />
                <line id="rc1"   className="calib-tick"     display="none" />
                <line id="rc2"   className="calib-tick"     display="none" />
                <circle id="rd1" className="calib-cap" r="4" display="none" />
                <circle id="rd2" className="calib-cap" r="4" display="none" />
              </svg>

              {/* Snap guide lines — rendered imperatively by useStudio during drag */}
              <svg
                id="snap-svg"
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'none', overflow: 'visible' }}
              />

              {/* Artwork overlay layer — perspective transform applied here when skew is active */}
              <div
                id="artwork-layer"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transformOrigin: '0 0' }}
              />

              {/* Skew corner handles — rendered imperatively by useStudio */}
              <svg
                id="skew-handles-svg"
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'none', overflow: 'visible' }}
              />

              {/* Client pick stamp */}
              {clientPickedOption && activeOption && clientPickedOption === activeOption && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'var(--charcoal)', color: 'white',
                  fontSize: 11, fontFamily: 'Karla', fontWeight: 600,
                  padding: '4px 10px', letterSpacing: '0.04em',
                  pointerEvents: 'none', zIndex: 20,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ color: 'var(--accent)' }}>✓</span> Client&apos;s pick
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading spinner — overlaid on canvas during option load, skew persist, PNG export */}
      {studio.busy && <ArcSpinner imageRef={elevImgRef} />}

      {/* Zoom controls */}
      {hasElev && (
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => changeZoom(-0.1, state)} title="Zoom out">−</button>
          <div className="zoom-label" id="zoom-label">{Math.round(state.zoom * 100)}%</div>
          <button className="zoom-btn" onClick={() => changeZoom(0.1, state)} title="Zoom in">+</button>
          <button className="zoom-btn" style={{ fontSize: 10, width: 40 }} onClick={() => setZoomFit(state)} title="Fit">Fit</button>
        </div>
      )}
    </div>
  )
}
