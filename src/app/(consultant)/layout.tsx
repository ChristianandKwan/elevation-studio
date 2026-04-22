import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/auth'
import FeedbackButton from '@/components/feedback/FeedbackButton'

export default async function ConsultantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <>
      {children}
      <FeedbackButton />
    </>
  )
}
