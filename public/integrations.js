// Official MCP metadata. The separate personal REST connector lives in lib/strava.mjs.
export const stravaConnection = Object.freeze({
  provider: 'strava', status: 'unavailable', checkedOn: '2026-11-07',
  endpoint: 'https://mcp.strava.com/mcp',
  guide: 'https://support.strava.com/en-us/articles/15401531-how-do-i-connect-strava-to-an-ai-assistant',
  policy: 'https://www.strava.com/legal/api_policy',
  reason: 'This standalone app has no authenticated, supported Strava MCP session. Connecting in another assistant does not connect this app.',
  capabilities: ['Personal activity history', 'Fitness trends', 'Cross-sport insights'],
});
