// v2.9.0
import React, { useRef, useEffect, useCallback } from 'react';

const MINIMAP_WIDTH = 150;
const MINIMAP_MAX_HEIGHT = 200;

export default function NotebookMinimap({
  elements,
  viewRef,
  pageWidth,
  pageBottom,
  wrapperWidth,
  wrapperHeight,
  onNavigate,
}) {
  const canvasRef = useRef(null);
  const isDragging = useRef(false);

  const scale = MINIMAP_WIDTH / pageWidth;
  const minimapHeight = Math.min(Math.round(pageBottom * scale), MINIMAP_MAX_HEIGHT);

  const handlePointer = useCallback(
    (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Convert minimap coords to canvas-space center, then to viewport pan offset
      const view = viewRef.current;
      const zoom = view?.zoom || 1;
      const canvasX = mx / scale;
      const canvasY = my / scale;
      // Center the viewport on this canvas point
      const newViewX = -(canvasX * zoom) + wrapperWidth / 2;
      const newViewY = -(canvasY * zoom) + wrapperHeight / 2;
      onNavigate({ x: newViewX, y: newViewY });
    },
    [scale, viewRef, wrapperWidth, wrapperHeight, onNavigate],
  );

  const onMouseDown = useCallback(
    (e) => {
      isDragging.current = true;
      handlePointer(e);
    },
    [handlePointer],
  );

  const onMouseMove = useCallback(
    (e) => {
      if (isDragging.current) handlePointer(e);
    },
    [handlePointer],
  );

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = minimapHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, MINIMAP_WIDTH, minimapHeight);

    // Draw elements
    if (elements && elements.length > 0) {
      elements.forEach((el) => {
        if ((!el.type || el.type === 'stroke') && el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = el.color || '#333';
          ctx.lineWidth = 0.5;
          const pts = el.points;
          ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
          }
          ctx.stroke();
        } else if (el.type === 'text') {
          ctx.fillStyle = '#aaa';
          const w = (el.width || 100) * scale;
          const h = (el.height || 20) * scale;
          ctx.fillRect(el.x * scale, el.y * scale, w, h);
        } else if (el.type === 'image') {
          ctx.fillStyle = '#ccc';
          const w = (el.width || 100) * scale;
          const h = (el.height || 100) * scale;
          ctx.fillRect(el.x * scale, el.y * scale, w, h);
        }
      });
    }

    // Draw viewport rectangle
    // viewRef.x/y are screen-space pan offsets; convert to canvas-space top-left
    const view = viewRef.current;
    if (view) {
      const zoom = view.zoom || 1;
      const canvasLeft = -(view.x || 0) / zoom;
      const canvasTop = -(view.y || 0) / zoom;
      const canvasW = wrapperWidth / zoom;
      const canvasH = wrapperHeight / zoom;
      const vx = canvasLeft * scale;
      const vy = canvasTop * scale;
      const vw = canvasW * scale;
      const vh = canvasH * scale;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, vy, vw, vh);
    }
  }, [elements, viewRef, scale, minimapHeight, wrapperWidth, wrapperHeight]);

  return (
    <div
      className="notebook-minimap"
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: MINIMAP_WIDTH,
        height: minimapHeight,
        border: '1px solid #ccc',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'crosshair',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        zIndex: 50,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: MINIMAP_WIDTH, height: minimapHeight, display: 'block' }}
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
