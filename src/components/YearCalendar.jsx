// v2.1.0
import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getLevel(count) {
  if (count === 0) return 0
  if (count <= 4)  return 1
  if (count <= 9)  return 2
  if (count <= 19) return 3
  return 4
}

export default function YearCalendar({ activityData = [], streak = 0 }) {
  const currentYear = new Date().getFullYear()
  const [viewYear, setViewYear] = useState(currentYear)

  const { cells, monthLabelRow, numCols } = useMemo(() => {
    const lookup = {}
    activityData.forEach(({ date, count }) => {
      lookup[date] = (lookup[date] || 0) + count
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = today.toISOString().slice(0, 10)

    // Start from Sunday on or before Jan 1 of viewYear
    const jan1 = new Date(viewYear, 0, 1)
    const startDate = new Date(jan1)
    startDate.setDate(startDate.getDate() - startDate.getDay())

    // End: Dec 31 of viewYear
    const dec31 = new Date(viewYear, 11, 31)

    // How many columns (weeks) needed?
    const totalDays = Math.ceil((dec31 - startDate) / 86400000) + 1
    const cols = Math.ceil(totalDays / 7)

    const cells = []
    const monthMarkers = []
    const seenMonths = new Set()
    const cur = new Date(startDate)

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(cur)
        const key = d.toISOString().slice(0, 10)
        const isFuture = d > today
        const isOutOfYear = d.getFullYear() !== viewYear

        // Track month starts for labels (only within viewYear)
        if (!isOutOfYear && d.getDate() === 1 && !seenMonths.has(d.getMonth())) {
          seenMonths.add(d.getMonth())
          monthMarkers.push({ col, label: MONTH_NAMES[d.getMonth()] })
        }

        cells.push({
          date:        key,
          count:       (isFuture || isOutOfYear) ? 0 : (lookup[key] || 0),
          isFuture:    isFuture || isOutOfYear,
          isToday:     key === todayKey,
          col,
        })
        cur.setDate(cur.getDate() + 1)
      }
    }

    const monthLabelRow = new Array(cols).fill('')
    monthMarkers.forEach(({ col, label }) => { monthLabelRow[col] = label })

    return { cells, monthLabelRow, numCols: cols }
  }, [activityData, viewYear])

  return (
    <div className="year-cal">
      {/* Header */}
      <div className="year-cal-header">
        <span className="year-cal-title">Activity</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {streak > 0 && (
            <span className="year-cal-streak">{streak} day streak 🔥</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setViewYear(y => y - 1)}
              className="year-cal-nav-btn"
              title="Previous year"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="year-cal-year">{viewYear}</span>
            <button
              onClick={() => setViewYear(y => y + 1)}
              className="year-cal-nav-btn"
              disabled={viewYear >= currentYear}
              title="Next year"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ width: '100%' }}>

        {/* Month labels */}
        <div className="year-cal-months" style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}>
          {monthLabelRow.map((label, i) => (
            <div key={i} className="year-cal-month-cell">
              {label}
            </div>
          ))}
        </div>

        {/* Cell grid */}
        <div
          className="year-cal-grid"
          style={{
            gridTemplateColumns: `repeat(${numCols}, 1fr)`,
            gridTemplateRows: 'repeat(7, 10px)',
          }}
        >
          {cells.map((day, i) => (
            <div
              key={i}
              className={`year-cal-cell${day.isToday ? ' today' : ''}${day.isFuture ? ' future' : ''}`}
              data-level={getLevel(day.count)}
              title={
                day.count > 0
                  ? `${day.date}: ${day.count} card${day.count !== 1 ? 's' : ''}`
                  : day.date
              }
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="year-cal-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(l => (
          <div key={l} className="year-cal-legend-cell" data-level={l} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
