export const WELCOME_TOUR_EVENT = 'revision-engine:replay-welcome-tour';

export function replayFirstVisitTour(): void {
  window.dispatchEvent(new Event(WELCOME_TOUR_EVENT));
}
