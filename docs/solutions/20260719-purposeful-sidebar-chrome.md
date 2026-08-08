# Purposeful sidebar chrome

## Persistent elements

Every persistent sidebar element has one user-facing purpose:

| Element             | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Site title          | Identifies the generated knowledge base                                                   |
| Branch pills        | Scope navigation to one content branch and expose the active branch as pressed state      |
| Search field        | Filters the document tree; result count and stepping controls appear only during a search |
| Folder chevrons     | Expose hierarchy and expansion state                                                      |
| Prefix badge        | Keeps the document's stable public identifier recognizable at a glance                    |
| `NEW` marker        | Communicates actual recency derived from document dates                                   |
| Settings button     | Keeps the persisted theme preference available                                            |
| Mobile close button | Exits the modal navigation panel                                                          |

The terminal glyph, branch badge, `publish: true` copy, animated `Online`
status, and static `UTF-8` label did not represent actionable or live state, so
they are removed. The branch pills remain because each one is an actionable
view switch. A compact bottom toolbar retains only the purposeful settings
action and provides a stable light-DOM endpoint for the mobile focus loop after
the shadow-DOM tree.

## Branch and tree behavior

Branch selection uses a labeled group of native `<button>` pills. Native button
keyboard behavior is preserved, `aria-pressed` exposes the current branch, and
the default branch is identified through its accessible label and tooltip.
Runtime-driven and automatic branch changes update the same pressed state and
the existing persisted branch key.

Document rows reclaim horizontal space through tighter tree padding and hidden
generic file icons while folder chevrons remain. Prefix and title stay in the
canonical tree path used by `@pierre/trees` for search and accessibility. EIAM
only synchronizes presentation data attributes on recycled rows; it never
replaces the library-owned label nodes. Shadow styles render that data as a
fixed prefix badge followed by a start-aligned, end-ellipsized title. This keeps
the `NEW` lane independent and prevents a recycled row from retaining a
previous document label after folders are collapsed or expanded.

## Regression coverage

Browser coverage verifies keyboard branch switching and persistence, the
absence of the select and static chrome, conditional search controls, accessible
tree labels, and settings availability. Collapse/expand coverage repeatedly
recycles tree rows and verifies that badge/title data remains tied to each path.
Responsive tests additionally verify that file icons are suppressed, long
titles use end ellipsis from their first character, and label lanes stay inside
the tree without overlapping `NEW` decorations.
