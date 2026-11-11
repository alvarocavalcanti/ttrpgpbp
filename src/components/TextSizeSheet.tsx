import { BottomSheet } from './BottomSheet'
import {
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  useTextSize,
} from '../hooks/useTextSize'

interface TextSizeSheetProps {
  onClose: () => void
}

// Slider sheet for the app-wide Text size preference (issue #807). A native
// range input keeps touch, keyboard and screen-reader support without a
// custom widget; the app scales live behind the sheet, so it is its own
// preview.
/** Bottom sheet that adjusts the app-wide text size with a native slider. */
export function TextSizeSheet({ onClose }: TextSizeSheetProps) {
  const { percent, setPercent } = useTextSize()

  return (
    <BottomSheet title="Text size" onClose={onClose}>
      <p className="text-sm text-surface-600 dark:text-surface-300">
        Makes everything in the app bigger or smaller. This only changes this device.
      </p>
      <div className="mt-4 flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
        <span>{TEXT_SIZE_MIN}%</span>
        <span aria-hidden="true" className="text-base font-semibold text-surface-900 dark:text-surface-100">
          {percent}%
        </span>
        <span>{TEXT_SIZE_MAX}%</span>
      </div>
      <input
        type="range"
        aria-label="Text size"
        aria-valuetext={`${percent}%`}
        min={TEXT_SIZE_MIN}
        max={TEXT_SIZE_MAX}
        step={TEXT_SIZE_STEP}
        value={percent}
        onChange={e => setPercent(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer accent-primary-600"
      />
    </BottomSheet>
  )
}
