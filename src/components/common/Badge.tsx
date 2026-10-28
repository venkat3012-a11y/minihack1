import React from 'react'

interface BadgeProps {
  status: string
  label?: string
}

export const Badge: React.FC<BadgeProps> = ({ status, label }) => {
  const s = status.toLowerCase()
  const text = label || status

  if (s === 'reviewed' || s === 'published' || s === 'active' || s === 'easy') {
    return <span className="badge-success">{text}</span>
  }
  if (s === 'evaluated' || s === 'submitted' || s === 'draft' || s === 'medium') {
    return <span className="badge-indigo">{text}</span>
  }
  if (s === 'flagged' || s === 'requires review' || s === 'pending review') {
    return <span className="badge-warning">⚠ {text}</span>
  }
  if (s === 'hard' || s === 'deactivated' || s === 'error') {
    return <span className="badge-danger">{text}</span>
  }
  if (s === 'archived') {
    return <span className="badge-neutral">{text}</span>
  }

  return <span className="badge-neutral">{text}</span>
}
