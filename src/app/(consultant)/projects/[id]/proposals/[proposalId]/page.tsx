import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/auth'
import ProposalScreen from '@/components/proposals/ProposalScreen'

interface Props {
  params: Promise<{ id: string; proposalId: string }>
}

/**
 * A proposal Claude is building: its pages, the chat, the download.
 * Everything live comes from /api/proposals/[id]; this only establishes that
 * the project is the consultant's and hands over the names.
 */
export default async function ProposalPage({ params }: Props) {
  const { id, proposalId } = await params
  const supabase = await createClient()
  const user = await getCurrentUser()

  const [{ data: project }, { data: proposal }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('consultant_id', user!.id).maybeSingle(),
    supabase.from('proposals').select('id, project_id').eq('id', proposalId).maybeSingle(),
  ])
  if (!project || !proposal || proposal.project_id !== project.id) notFound()

  return <ProposalScreen projectId={project.id} projectName={project.name} proposalId={proposal.id} />
}
