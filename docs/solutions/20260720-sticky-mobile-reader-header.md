# Sticky mobile reader header

## Reader structure

Compact layouts expose explorer access in a sticky header at the top of the reader scroll
container. The header contains one 44px menu control and the current document title. The title
uses a single ellipsized visual line while its complete text remains in the document and is
updated after client-side navigation or a missing-route transition.

The former fixed bottom pill is removed. Article content, backlinks, and previous/next navigation
therefore keep the entire viewport and cannot be covered by the explorer control. Desktop layouts
continue to use the persistent sidebar and hide the compact reader header.

## Viewport and modal contracts

The viewport metadata opts into `viewport-fit=cover`. Shared safe-area variables protect the sticky
header, fixed modal drawer, skip link, reader content, and persistent desktop chrome. Desktop applies
all four insets at the app-shell boundary before laying out its grid. Compact mode resets that shell
padding and applies the insets at the drawer boundary instead, which avoids double spacing while
keeping the title, close action, search, tree, settings tool, and settings popover inside the usable
viewport. Header flex children can shrink without introducing horizontal overflow when the browser
is zoomed or the viewport is narrow.

The header stays below the sidebar overlay in the stacking order. Opening the explorer preserves
the existing modal contract: the reader becomes inert, focus is trapped in the drawer, Escape or
an overlay click closes it, and focus returns to the header menu control.

## Settings and regression coverage

The obsolete left/right floating-button setting, localization copy, body class, and storage writes
are removed. Existing saved values are harmless and ignored; theme persistence remains unchanged.

Browser tests cover narrow and short compact viewports, sticky positioning after reader scroll,
client-side title updates, zoom containment, simulated non-zero safe-area containment for compact
and desktop chrome, overlay dismissal and focus restoration, safe-area source contracts, and desktop
header hiding. The existing focus-loop test continues to exercise Tab, Shift+Tab, and Escape behavior
inside the modal sidebar.
