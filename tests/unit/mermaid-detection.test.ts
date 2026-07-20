import { describe, expect, test } from "bun:test";
import { hasMermaidDocuments } from "../../src/build/content";
import type { DocRecord } from "../../src/types";

function documentWithBody(body: string): DocRecord {
  return { body } as DocRecord;
}

describe("Mermaid document detection", () => {
  test("detects the same nested and case-insensitive fence info as the renderer", () => {
    expect(
      hasMermaidDocuments([
        documentWithBody(`> \`\`\`Mermaid title
> flowchart LR
>   A --> B
> \`\`\`
`),
      ]),
    ).toBe(true);
  });

  test("does not charge a site for Mermaid fence text inside another code block", () => {
    expect(
      hasMermaidDocuments([
        documentWithBody(`\`\`\`\`markdown
\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
\`\`\`\`
`),
      ]),
    ).toBe(false);
  });
});
