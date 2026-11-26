import type { Database } from '../../types/database'

export type Thread = Database['public']['Tables']['admin_threads']['Row'] & {
  creator: { display_name: string | null, avatar_url: string | null }
  gm?: { display_name: string | null, avatar_url: string | null }
  unread?: boolean
}

export type Message = Database['public']['Tables']['admin_messages']['Row'] & {
  // Null for system messages (no human sender) and whenever the sender's
  // profile join misses; every reader must handle it.
  sender: { display_name: string | null, avatar_url: string | null } | null
}

export type PollQuestionType = 'short_text' | 'single_choice' | 'multi_choice'

// A question as the composer edits it, before create_admin_poll persists it.
export type PollQuestionDraft = {
  // Stable client key so React can reorder rows without losing input focus.
  key: string
  prompt: string
  question_type: PollQuestionType
  is_required: boolean
  options: string[]
}

export type CreatePollInput = {
  subject: string
  description: string | null
  audience: 'all_users' | 'gms'
  questions: Array<{
    prompt: string
    question_type: PollQuestionType
    is_required: boolean
    options: string[]
  }>
}

export type PollQuestion = {
  id: string
  position: number
  prompt: string
  question_type: PollQuestionType
  is_required: boolean
  options: string[]
}

export type PollAnswerInput = {
  question_id: string
  selected_options?: number[]
  text_answer?: string | null
}

export type PollAnswer = {
  question_id: string
  selected_options: number[]
  text_answer: string | null
}

export type PollReportQuestion = PollQuestion & {
  total_answers: number
  option_counts: number[] | null
  text_answers: string[] | null
}

export type PollReport = {
  thread_id: string
  closed_at: string | null
  views: number
  replies: number
  questions: PollReportQuestion[]
}
