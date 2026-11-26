import type { TimerState } from '../../types/timer'
import type { NotificationEvent } from '../../types/notification'
import { TimerService } from '../timer/TimerService'
import { timerNotification } from './NotificationService'

// Forecast on an isolated engine with no persistence and no delivery side effects.
export function upcomingTimerEvents(state: TimerState | null, now: number): NotificationEvent[] {
  if (!state || state.status !== 'RUNNING' || state.mode === 'STOPWATCH' || !state.endTime) return []
  let clock = now
  const engine = new TimerService({ load: () => ({ state, config: state.config, records: [] }), save: () => undefined }, { now: () => clock })
  let future = engine.restore()
  engine.takeCompletedPhases()
  const events: NotificationEvent[] = []
  for (let phase = 0; phase < 3 && future.status === 'RUNNING' && future.endTime; phase++) {
    clock = future.endTime
    future = engine.synchronize()
    for (const completion of engine.takeCompletedPhases()) events.push(timerNotification(completion))
  }
  return events
}
