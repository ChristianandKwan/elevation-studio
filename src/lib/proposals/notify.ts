import { Resend } from 'resend'

/**
 * Tell Tom the proposal engine stopped, so a consultant is not left looking
 * at a proposal that will not move. Goes where feedback reports go
 * (FEEDBACK_TO_EMAIL). Best-effort: a failed email must not fail the request
 * that noticed the problem.
 */
export async function tellTomTheEngineStopped(args: { proposalId: string; projectName: string; reason: string; studioUrl?: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_TO_EMAIL
  if (!apiKey || !to) return
  try {
    await new Resend(apiKey).emails.send({
      from: 'Elevation Studio <onboarding@resend.dev>',
      to,
      subject: `Proposal engine stopped — ${args.projectName || 'a project'}`,
      text: [
        `A proposal for ${args.projectName || 'a project'} could not go on.`,
        '',
        `Why: ${args.reason}`,
        '',
        `Proposal ${args.proposalId}.`,
        'The consultant sees this reason on the proposal; a new message from them tries again.',
        'Runs are listed at https://claude.ai/code/routines.',
      ].join('\n'),
    })
  } catch (err) {
    console.error('[proposals] could not email about a stopped engine', err)
  }
}
