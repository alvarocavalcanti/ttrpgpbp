import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReportPromptSheet } from './ReportPromptSheet'

const renderSheet = (props: Partial<React.ComponentProps<typeof ReportPromptSheet>> = {}) => {
  const onConfirm = vi.fn()
  render(
    <ReportPromptSheet
      title="Report this message"
      label="Why are you reporting this message?"
      maxLength={1000}
      confirmLabel="Submit report"
      onConfirm={onConfirm}
      onClose={vi.fn()}
      consequence="Accounts that break the Acceptable Use Policy can be suspended."
      consentLabel="I understand this report goes to the server admin."
      learnMore={<p>Read the full guidance.</p>}
      {...props}
    />,
  )
  return { onConfirm }
}

const reasonInput = () => screen.getByLabelText('Why are you reporting this message?')
const consent = () => screen.getByRole('checkbox', { name: 'I understand this report goes to the server admin.' })
const submit = () => screen.getByRole('button', { name: 'Submit report' })

describe('ReportPromptSheet', () => {
  it('shows the consequence paragraph and the consent checkbox', () => {
    renderSheet()

    expect(screen.getByText('Accounts that break the Acceptable Use Policy can be suspended.')).toBeInTheDocument()
    expect(consent()).not.toBeChecked()
  })

  it('gates Submit behind both a reason and the consent checkbox', () => {
    renderSheet()

    // Neither condition met.
    expect(submit()).toBeDisabled()

    fireEvent.change(reasonInput(), { target: { value: 'spam' } })
    expect(submit()).toBeDisabled()

    fireEvent.click(consent())
    expect(submit()).toBeEnabled()

    fireEvent.change(reasonInput(), { target: { value: '   ' } })
    expect(submit()).toBeDisabled()
  })

  it('re-enables Submit only once consent and a reason are both present', () => {
    renderSheet()

    fireEvent.click(consent())
    expect(submit()).toBeDisabled()

    fireEvent.change(reasonInput(), { target: { value: 'harassment' } })
    expect(submit()).toBeEnabled()
  })

  it('submits the trimmed reason once consented', () => {
    const { onConfirm } = renderSheet()

    fireEvent.change(reasonInput(), { target: { value: '  spam  ' } })
    fireEvent.click(consent())
    fireEvent.click(submit())

    expect(onConfirm).toHaveBeenCalledWith('spam')
  })

  it('does not submit while consent is missing', () => {
    const { onConfirm } = renderSheet()

    fireEvent.change(reasonInput(), { target: { value: 'spam' } })
    fireEvent.click(submit())
    fireEvent.submit(reasonInput().closest('form') as HTMLFormElement)

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('expands the guidance on Learn more without ticking the checkbox', () => {
    renderSheet()

    const learnMore = screen.getByRole('button', { name: 'Learn more' })
    expect(learnMore).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(learnMore)

    expect(screen.getByText('Read the full guidance.')).toBeInTheDocument()
    expect(learnMore).toHaveAttribute('aria-expanded', 'true')
    // The link/button must be a sibling of the label, or clicking it would
    // consent to a report the reporter never agreed to.
    expect(consent()).not.toBeChecked()
  })

  it('collapses the guidance again on a second Learn more press', () => {
    renderSheet()

    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }))

    expect(screen.queryByText('Read the full guidance.')).not.toBeInTheDocument()
  })

  it('keeps the typed reason and consent when the guidance is expanded', () => {
    renderSheet()

    fireEvent.change(reasonInput(), { target: { value: 'already typed' } })
    fireEvent.click(consent())
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }))

    expect(reasonInput()).toHaveValue('already typed')
    expect(consent()).toBeChecked()
  })

  it('disables Submit while the caller reports the request pending', () => {
    renderSheet({ pending: true })

    fireEvent.change(reasonInput(), { target: { value: 'spam' } })
    fireEvent.click(consent())

    expect(submit()).toBeDisabled()
  })
})
