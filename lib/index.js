// Host half of the peak-valley-ticker plugin.
// The visual work happens in the client half (lib/client.js), which registers
// a `shell.overlay` list-slot entry rendering the 峰/谷 price ticker.
// This host half exists so the plugin row composes as a normal Cordis entry;
// the client bundle is declared via package.json `dsh.client`.

export const name = 'peak-valley-ticker'

export const inject = []

export function apply() {
  // No host-side contribution: the ticker is a pure client-surface overlay.
}
