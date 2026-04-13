/** Full-page “Rizz Analytics” app surface (not a Telegram popup beside settings). */
import {showRizzAnalysisHub} from './rizzAnalysisHub';

export function openRizzAnalyticsApp() {
  showRizzAnalysisHub({appMode: true});
}
