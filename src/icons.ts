export const APP_ICON_NAMES = [
  "arrow-left",
  "arrow-right",
  "calendar",
  "check",
  "chevron-down",
  "chevron-right",
  "chevron-up",
  "close",
  "copy",
  "folder-off",
  "home",
  "menu",
  "search",
  "settings",
] as const;

export type AppIconName = (typeof APP_ICON_NAMES)[number];

export function renderAppIcon(name: AppIconName, className = ""): string {
  const classes = className ? `app-icon ${className}` : "app-icon";
  return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="#eiam-icon-${name}"></use></svg>`;
}
