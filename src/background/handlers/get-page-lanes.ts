import { probe } from '../lib/frame-offers'
import { ensureContentScript } from '../lib/host-access'
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

  // No tab is the one case with nothing to ask and no answer to infer.
  if (!tab?.id) return { ok: true, data: { probed: false, lanes: [] } }

  // The same on-demand injection START_CAPABILITY_FILL performs before its own
  // probe, so this question reaches exactly the frames a fill would reach.
  // Asking without it leaves the probe blind wherever the fill is not — a page
  // granted after it loaded, or a user running on activeTab alone, who would
  // otherwise be shown their whole card list on every page they open.
  //
  // Injection failing means a page no content script can enter — chrome://,
  // the web store, a PDF — where a fill would find nothing either. So the
  // probe still runs and its silence is reported as an answer rather than as
  // an unheard question.
  await ensureContentScript(tab.id, true)

  const answers = await Promise.all(LANES.map(lane => probe(tab.id!, lane)))

  return { ok: true, data: { probed: true, lanes: LANES.filter((_, i) => answers[i].length > 0) } }
}
