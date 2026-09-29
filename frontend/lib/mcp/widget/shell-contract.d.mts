// Types for shell-contract.mjs (plain JS so the Node 20 smoke script can import it).
export declare const WIDGET_ASSET_PATH: '/mcp-widget/v3'
export declare const WIDGET_SHELL_MAX_BYTES: number
export declare function widgetAssetUrls(origin: string): { js: string; css: string }
export declare function widgetShellProblems(html: string, origin: string): string[]
export declare function widgetAssetProblems(
  kind: 'js' | 'css',
  res: { status: number; headers: { get(name: string): string | null } },
): string[]
