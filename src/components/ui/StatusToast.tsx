'use client'

interface Props {
  message: string
}

export default function StatusToast({ message }: Props) {
  return (
    <div className={`status-bar${message ? ' show' : ''}`}>
      {message}
    </div>
  )
}
