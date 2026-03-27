'use client'

import { useState } from 'react'
import ClientElevation from './ClientElevation'
import StatusToast from '@/components/ui/StatusToast'

interface ClientArtwork {
  id: string
  name: string
  imageUrl: string | null
  wCm: number
  hCm: number
  xF: number
  yF: number
  visible: boolean
  price: number
  priceIncludes: string
}

interface ClientOption {
  id: string
  option: string
  imageUrl: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  zoom: number
  approved: boolean
  approved_at: string | null
  foreground_masks?: any[] | null
  artworks: ClientArtwork[]
}

interface ClientElevationData {
  id: string
  name: string
  elevation_options: ClientOption[]
}

interface Props {
  token: string
  project: {
    id: string
    name: string
    clientName: string
    status: string
    consultantName: string
    consultantInitials: string
    preparedAt: string
  }
  elevations: ClientElevationData[]
  approvalActivity: Array<{ id: string; type: string; text: string; created_at: string }>
}

export default function ClientPortal({ token, project, elevations, approvalActivity }: Props) {
  const [toast, setToast] = useState('')

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="client-wrapper">
      {/* Header */}
      <div className="client-header">
        <img src="/ck-wordmark-white.png" alt="Christian & Kwan" className="client-logo" />
        <div className="client-project-label">{project.name}</div>
      </div>

      {/* Cover */}
      <div className="client-cover">
        <div className="client-cover-left">
          <div className="client-cover-kicker">Art Placement Proposal</div>
          <div className="client-cover-title">{project.name}</div>
          <div style={{ fontSize: 14, opacity: .7, marginTop: 4 }}>{project.clientName}</div>
          <div className="client-cover-date">Prepared {project.preparedAt}</div>
        </div>
      </div>

      {/* Elevations */}
      <div className="client-body">
        {elevations.map(elev => (
          <ClientElevation
            key={elev.id}
            elevation={elev}
            token={token}
            projectId={project.id}
            approvalActivity={approvalActivity}
            onStatus={onStatus}
          />
        ))}
      </div>

      <StatusToast message={toast} />
    </div>
  )
}
