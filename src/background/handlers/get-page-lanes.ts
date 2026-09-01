import { probe } from '../lib/frame-offers'
import { hasHostAccess } from '../lib/host-access'
import { activeTab } from '../lib/tabs'
import type { IpcResult } from '../../shared/ipc'
import type { PageLanes } from '../../shared/messages'
import type { Capability } from '../../shared/types'

// Which capability lanes the active tab actually has somewhere to put a value.
//
// Cards and addresses are offered to the popup by capability alone, with no
// URL evidence behind them, so without this every card in the vault is listed
// on every page. The probe is the page's own answer to "could you take one of
// these", from the same classifier the fill would use.
//
// Login is deliberately not probed. Those rows are URL-matched, so they have
// real evidence already, and a 150ms snapshot is no basis for hiding a row a
// late-mounting form would accept a second later. A login fill that finds
// nothing still reports NO_FILLABLE_FIELD.
const LANES: Capability[] = ['card', 'address']

export async function handle(): Promise<IpcResult<PageLanes>> {
  const tab = await activeTab()

  // Without a content script nothing can answer, and silence is not the same
  // as "nothing here" — the popup injects on demand at fill time, so a page
  // we can't probe may still be fillable. Said plainly so the caller shows
  // everything rather than hiding the vault behind a question nobody heard.
  if (!tab?.id || !(await hasHostAccess())) {
    return { ok: true, data: { probed: false, lanes: [] } }
  }

  const answers = await Promise.all(LANES.map(lane => probe(tab.id!, lane)))

  return { ok: true, data: { probed: true, lanes: LANES.filter((_, i) => answers[i].length > 0) } }
}
