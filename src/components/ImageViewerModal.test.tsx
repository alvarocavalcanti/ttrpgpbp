import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ImageViewerModal } from './ImageViewerModal'

const URL = 'https://example.com/pic.png'

function setNaturalSize(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true })
}

// Simulate a two-finger pinch: start with the given spread, move to a new one.
function pinch(viewport: HTMLElement, fromDist: number, toDist: number) {
  const twoFinger = (dist: number) => ({
    touches: [
      { clientX: 0, clientY: 0 },
      { clientX: dist, clientY: 0 },
    ],
  })
  fireEvent.touchStart(viewport, twoFinger(fromDist))
  fireEvent.touchMove(viewport, twoFinger(toDist))
  fireEvent.touchEnd(viewport, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] })
}

// Touch/gesture handlers sit on the scrollable viewport, not the dialog shell.
function getViewport(dialog: HTMLElement): HTMLElement {
  return dialog.querySelector('div.overflow-auto') as HTMLElement
}

describe('ImageViewerModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a fullscreen dialog with the resolved image', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Map' })
    expect(dialog).toHaveClass('fixed', 'inset-0')
    expect(screen.getByAltText('Map')).toHaveAttribute('src', URL)
  })

  it('closes via the X button and via Escape', () => {
    const onClose = vi.fn()
    render(<ImageViewerModal src={URL} alt="Map" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows zoom as a percentage starting at fit (100%)', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('steps zoom by x1.25 with the +/- buttons', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByText('125%')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Zoom out'))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clamps zoom at 100% minimum and 800% maximum', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const minus = screen.getByLabelText('Zoom out')
    const plus = screen.getByLabelText('Zoom in')
    for (let i = 0; i < 30; i++) fireEvent.click(minus)
    expect(screen.getByText('100%')).toBeInTheDocument()
    for (let i = 0; i < 30; i++) fireEvent.click(plus)
    expect(screen.getByText('800%')).toBeInTheDocument()
  })

  it('fits the image to the viewport on load without upscaling', () => {
    const { container } = render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const img = container.querySelector('img') as HTMLImageElement
    setNaturalSize(img, 100, 50) // smaller than viewport → never upscaled
    fireEvent.load(img)
    expect(img).toHaveStyle({ width: '100px', height: '50px' })
  })

  it('scales large images down to fit the viewport on load', () => {
    // Viewport 1024x768; image 2048x1024 → fit scale 0.5 (width-bound).
    const { container } = render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const img = container.querySelector('img') as HTMLImageElement
    setNaturalSize(img, 2048, 1024)
    fireEvent.load(img)
    expect(img).toHaveStyle({ width: '1024px', height: '512px' })
  })

  it('applies zoom to the fitted size', () => {
    const { container } = render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const img = container.querySelector('img') as HTMLImageElement
    setNaturalSize(img, 2048, 1024)
    fireEvent.load(img)
    fireEvent.click(screen.getByLabelText('Zoom in')) // 125%
    expect(img).toHaveStyle({ width: '1280px', height: '640px' })
  })

  it('resets zoom on double-click', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByText('125%')).toBeInTheDocument()
    fireEvent.doubleClick(getViewport(screen.getByRole('dialog')))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('scales zoom by the pinch distance ratio', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    // Spread from 100px to 250px → zoom x2.5, displayed as 250%.
    pinch(getViewport(screen.getByRole('dialog')), 100, 250)
    expect(screen.getByText('250%')).toBeInTheDocument()
  })

  it('clamps pinch zoom at the 800% maximum', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    pinch(getViewport(screen.getByRole('dialog')), 100, 5000) // x50 → clamped to x8
    expect(screen.getByText('800%')).toBeInTheDocument()
  })

  it('pinches relative to the zoom at gesture start, not the live value', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const viewport = getViewport(screen.getByRole('dialog'))
    pinch(viewport, 100, 200) // zoom → 200%
    // Second gesture starts again at 100px spread: base zoom is now 2, so
    // doubling the spread lands at 400%, not compounding from 200% x2.
    pinch(viewport, 100, 200)
    expect(screen.getByText('400%')).toBeInTheDocument()
  })

  it('resets zoom on a quick double-tap', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const viewport = getViewport(screen.getByRole('dialog'))
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(screen.getByText('125%')).toBeInTheDocument()
    const tap = { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] }
    fireEvent.touchEnd(viewport, tap)
    fireEvent.touchEnd(viewport, tap)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('does not treat the end of a pinch as a double-tap', () => {
    render(<ImageViewerModal src={URL} alt="Map" onClose={vi.fn()} />)
    const viewport = getViewport(screen.getByRole('dialog'))
    pinch(viewport, 100, 250) // zoom → 250%; its touchEnd must not count as a tap
    fireEvent.touchEnd(viewport, { touches: [], changedTouches: [{ clientX: 0, clientY: 0 }] })
    expect(screen.getByText('250%')).toBeInTheDocument()
  })
})
