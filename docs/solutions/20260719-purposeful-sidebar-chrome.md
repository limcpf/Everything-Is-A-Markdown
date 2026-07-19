# Purposeful sidebar chrome

## Persistent elements

Every persistent sidebar element has one user-facing purpose:

| Element             | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Site title          | Identifies the generated knowledge base                                                   |
| Branch selector     | Scopes navigation to one content branch; the default option is identified in its label    |
| Search field        | Filters the document tree; result count and stepping controls appear only during a search |
| Folder chevrons     | Expose hierarchy and expansion state                                                      |
| Prefix text         | Preserves the document's stable public identifier without pill decoration                 |
| `NEW` marker        | Communicates actual recency derived from document dates                                   |
| Settings button     | Keeps the persisted theme preference available                                             |
| Mobile close button | Exits the modal navigation panel                                                          |

The terminal glyph, branch badge and pills, `publish: true` copy, animated
`Online` status, and static `UTF-8` label did not represent actionable or live
state, so they are removed. A compact bottom toolbar retains only the purposeful
settings action and provides a stable light-DOM endpoint for the mobile focus
loop after the shadow-DOM tree.

## Branch and tree behavior

Branch selection uses a labeled native `<select>`. It retains browser keyboard
behavior, exposes the current value directly to assistive technology, and
requires one control regardless of branch count. Runtime-driven and automatic
branch changes update the same control and the existing persisted branch key.

Document rows reclaim horizontal space in three ways: horizontal tree and row
padding decrease, generic file icons are visually suppressed while folder
chevrons remain, and prefixes become compact monospace text instead of bordered
pills. Full prefix/title text remains available through the row title and the
existing overflow tooltip behavior.

## Regression coverage

Browser coverage verifies native keyboard branch switching and persistence,
the absence of static chrome, conditional search controls, inline prefixes,
and settings availability. Responsive tests additionally verify that file
icons are suppressed, the tighter row padding is applied, and long labels stay
inside the tree without overlapping `NEW` decorations.
