/// <reference types="cypress" />

/**
 * MCP agent edit → browser visibility (Story 13 regression harness).
 *
 * Simulates openclaw calling doc-collab MCP tools while a human has the
 * collab editor open. Requires `npm run dev` (or `npm start`) on port 3000.
 *
 * Run: npm run cypress:mcp-sync
 */

const DOC_ID = "cypress-mcp-browser-sync";

function visitCollabEditor() {
  cy.visit(`/editor/${DOC_ID}?collab=1`);
  cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
}

function waitForCollabConnected() {
  cy.contains('[aria-live="polite"]', "Collaborative", { timeout: 20_000 }).should("be.visible");
  cy.contains('[aria-live="polite"]', "Synced", { timeout: 20_000 }).should("be.visible");
}

function agentMarkdown(tag: string): string {
  return `# OpenClaw Test

## Purpose

Initial purpose text ${tag}.

## Next steps

- Simultaneous editing test
- Version conflict test
- Cross-synchronization test
`;
}

describe("MCP agent edits sync to browser", () => {
  const tag = `mcp-${Date.now()}`;

  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request({
      method: "DELETE",
      url: `/api/documents/${DOC_ID}`,
      failOnStatusCode: false,
    });
    const initialMarkdown = `# OpenClaw Test

## Purpose

Initial purpose text ${tag}.`;
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: DOC_ID,
        content: initialMarkdown,
      },
    });
    // Reset in-memory Y.Doc (API create alone leaves stale Hocuspocus state).
    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: initialMarkdown,
    });
  });

  afterEach(() => {
    cy.request({
      method: "DELETE",
      url: `/api/documents/${DOC_ID}`,
      failOnStatusCode: false,
    });
  });

  it("shows MCP full-document update (with bullet list) live in the open editor", () => {
    visitCollabEditor();
    waitForCollabConnected();

    cy.get(".ProseMirror").should("contain.text", `Initial purpose text ${tag}`);
    cy.get(".ProseMirror").should("not.contain.text", "Next steps");

    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: agentMarkdown(tag),
    });

    cy.get(".ProseMirror", { timeout: 10_000 })
      .should("contain.text", "Next steps")
      .and("contain.text", "Simultaneous editing test")
      .and("contain.text", "Cross-synchronization test");
    cy.contains("This document was changed elsewhere").should("not.exist");

    // Hocuspocus persistence debounce (400 ms).
    cy.wait(1500);
    cy.request("GET", `/api/documents/${DOC_ID}`).then((resp) => {
      expect(resp.body.content).to.include("Next steps");
      expect(resp.body.content).to.include("Simultaneous editing test");
    });
  });

  it("shows MCP update when the editor opens after the agent edit", () => {
    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: agentMarkdown(tag),
    });

    visitCollabEditor();
    waitForCollabConnected();

    cy.get(".ProseMirror", { timeout: 10_000 })
      .should("contain.text", "Next steps")
      .and("contain.text", "Simultaneous editing test");
  });

  it("shows consecutive MCP updates (append section with bold) live in the open editor", () => {
    visitCollabEditor();
    waitForCollabConnected();

    cy.get(".ProseMirror").should("contain.text", `Initial purpose text ${tag}`);

    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: `# OpenClaw Test

## Purpose

First update ${tag}.

## Next steps

- First bullet`,
    });

    cy.get(".ProseMirror", { timeout: 10_000 }).should("contain.text", "First bullet");

    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: `# OpenClaw Test

## Purpose

First update ${tag}.

## Next steps

- First bullet
- **Second bold bullet** ${tag}

## Installation prices

- **Base install:** 80 000 – 110 000 Ft`,
    });

    cy.get(".ProseMirror", { timeout: 10_000 })
      .should("contain.text", "First bullet")
      .and("contain.text", "Second bold bullet")
      .and("contain.text", "Installation prices");

    cy.wait(1500);
    cy.request("GET", `/api/documents/${DOC_ID}`).then((resp) => {
      expect(resp.body.content).to.include("Second bold bullet");
      expect(resp.body.content).to.include("Installation prices");
    });
  });

  it("accepts update_document with stale disk etag when MCP_COLLAB uses CRDT", () => {
    let staleEtag = "";

    cy.request("GET", `/api/documents/${DOC_ID}`).then((resp) => {
      staleEtag = resp.body.etag as string;
    });

    // Simulates Hocuspocus persistence (or any system write) bumping disk etag
    // while the agent still holds the etag from an earlier read_document.
    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: `# OpenClaw Test

## Purpose

System persist bump ${tag}.`,
    });

    cy.wait(1500);
    cy.request("GET", `/api/documents/${DOC_ID}`).then((resp) => {
      expect(resp.body.etag).not.to.eq(staleEtag);
    });

    const finalMarkdown = `${agentMarkdown(tag)}

## Append after stale etag

- **bold item** ${tag}`;

    cy.then(() =>
      cy.task("mcpUpdateDocumentWithVersion", {
        documentId: DOC_ID,
        markdown: finalMarkdown,
        expectedVersion: staleEtag,
      }),
    );

    cy.request("GET", `/api/documents/${DOC_ID}`).then((resp) => {
      expect(resp.body.content).to.include("Append after stale etag");
      expect(resp.body.content).to.include("bold item");
    });

    visitCollabEditor();
    waitForCollabConnected();
    cy.get(".ProseMirror", { timeout: 10_000 })
      .should("contain.text", "Append after stale etag")
      .and("contain.text", "bold item");
  });

  it("lists MCP-created documents on the home page", () => {
    const createId = `${DOC_ID}-created`;
    cy.request({
      method: "DELETE",
      url: `/api/documents/${createId}`,
      failOnStatusCode: false,
    });

    cy.task("mcpCreateDocument", {
      name: createId,
      content: agentMarkdown(tag),
    });

    cy.visit("/");
    cy.get(`a[href="/editor/${createId}"]`, { timeout: 10_000 }).should("be.visible");

    cy.request({
      method: "DELETE",
      url: `/api/documents/${createId}`,
      failOnStatusCode: false,
    });
  });
});
