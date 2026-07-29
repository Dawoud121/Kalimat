import React, { useState } from 'react'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getLevel(count, isFuture) {
  if (isFuture || count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

/**
 * ActivityHeatmap — monthly calendar view
 * Props:
 *   activityData: Array<{ date: 'YYYY-MM-DD', count: number }>
 */
export default function ActivityHeatmap({ activityData = [] }) {
  const todayObj = new Date()
  todayObj.setHours(0, 0, 0, 0)
  const todayKey = todayObj.toISOString().slice(0, 10)

  const [viewYear,  setViewYear]  = useState(todayObj.getFullYear())
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth()) // 0-indexed

  // Build date → count lookup from all activity data
  const lookup = {}
  activityData.forEach(({ date, count }) => {
    lookup[date] = (lookup[date] || 0) + count
  })

  // Navigation helpers
  const isCurrentMonth =
    viewYear === todayObj.getFullYear() && viewMonth === todayObj.getMonth()

  const goBack = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  const goForward = () => {
    if (isCurrentMonth) return
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // Build calendar grid
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startDow     = firstOfMonth.getDay() // 0 = Sunday

  // Leading empty cells + day cells
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date     = new Date(viewYear, viewMonth, d)
    const key      = date.toISOString().slice(0, 10)
    const isFuture = date > todayObj
    cells.push({
      day:      d,
      date:     key,
      count:    lookup[key] || 0,
      isFuture,
      isToday:  key === todayKey,
    })
  }

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: 'long',
    year:  'numeric',
  })

  // Total reviews this month (for the subtitle)
  const monthTotal = cells
    .filter(c => c && !c.isFuture)
    .reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="heatmap-container">

      {/* ── Navigation bar ── */}
      <div className="heatmap-nav">
        <button className="heatmap-nav-btn" onClick={goBack} aria-label="Previous month">‹</button>
        <div className="heatmap-month-info">
          <span className="heatmap-month-label">{monthLabel}</span>
          {monthTotal > 0 && (
            <span className="heatmap-month-total">{monthTotal} review{monthTotal !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          className="heatmap-nav-btn"
          onClick={goForward}
          disabled={isCurrentMonth}
          aria-label="Next month"
        >›</button>
      </div>

      {/* ── Day-of-week headers ── */}
      <div className="heatmap-calendar">
        {DOW_LABELS.map(d => (
          <div key={d} className="heatmap-dow">{d}</div>
        ))}

        {/* ── Day cells ── */}
        {cells.map((cell, i) =>
          !cell ? (
            <div key={`pad-${i}`} className="heatmap-day heatmap-day-empty" />
          ) : (
            <div
              key={cell.date}
              className={`heatmap-day${cell.isToday ? ' today' : ''}${cell.isFuture ? ' future' : ''}`}
              data-level={getLevel(cell.count, cell.isFuture)}
              title={cell.count > 0
                ? `${cell.date}: ${cell.count} review${cell.count !== 1 ? 's' : ''}`
                : cell.date}
            >
              <span className="heatmap-day-num">{cell.day}</span>
              {cell.count > 0 && (
                <span className="heatmap-day-count">{cell.count}</span>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Legend ── */}
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div key={level} className="heatmap-legend-cell" data-level={level} />
        ))}
        <span>More</span>
      </div>

    </div>
  )
}
