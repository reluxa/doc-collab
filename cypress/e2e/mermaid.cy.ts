/// <reference types="cypress" />

describe("Mermaid diagram support", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-test",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: "cypress-mermaid-test",
        content: "# Test Doc\n\nStart.",
      },
    });
    cy.visit("/editor/cypress-mermaid-test?collab=0");
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");
    cy.get(".ProseMirror").click();
    // Clear existing content.
    cy.get(".ProseMirror").type("{ctrl}a{backspace}");
  });

  afterEach(() => {
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-test",
      failOnStatusCode: false,
    });
  });

  it("toolbar button inserts mermaid template", () => {
    // Click the mermaid diagram toolbar button.
    cy.get('button[aria-label="Mermaid diagram"]').trigger("mousedown", {
      force: true,
    });

    // The mermaid widget should appear (decoration plugin renders it).
    cy.get(".mermaid-widget", { timeout: 10000 }).should("be.visible");
  });

  it("renders flowchart, sequence diagram, and Gantt chart", () => {
    // Use the API to create a document with all diagram types.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-diag",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: "cypress-mermaid-diag",
        content: `# Diagram Test

\`\`\`mermaid
graph TD
  A[Start] --> B[End]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  Dev->>CI: Push
  CI-->>Dev: Done
\`\`\`

\`\`\`mermaid
gantt
  title Test
  section S
  Task :a1, 2024-01-01, 2d
\`\`\``,
      },
    });

    // Navigate directly to the document.
    cy.visit("/editor/cypress-mermaid-diag?collab=0");
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");

    // All three diagram widgets should be visible.
    cy.get(".mermaid-widget", { timeout: 15000 }).should("have.length", 3);

    // Cleanup.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-diag",
      failOnStatusCode: false,
    });
  });

  it("toggle button switches between diagram and source code", () => {
    // Use the API to create a document with a mermaid block.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-test",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: "cypress-mermaid-test",
        content: `# Toggle Test

\`\`\`mermaid
graph TD; A-->B;
\`\`\``,
      },
    });

    // Reload the editor.
    cy.reload();
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");

    // The diagram widget should be visible.
    cy.get(".mermaid-widget", { timeout: 10000 }).should("be.visible");

    // Click the toggle button to show source code.
    cy.get('button[aria-label="Show source code"]').first().click();

    // The source code should be visible.
    cy.contains("graph TD; A-->B;", { timeout: 5000 }).should("be.visible");

    // Click the toggle button to show diagram again.
    cy.get('button[aria-label="Show diagram preview"]').first().click();

    // The diagram widget should be visible again.
    cy.get(".mermaid-widget", { timeout: 5000 }).should("be.visible");
  });

  it("preserves mermaid code block in markdown round-trip", () => {
    // Use the API to create a document with a mermaid block.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-rt",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: "cypress-mermaid-rt",
        content: `# Round Trip Test

\`\`\`mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action]
  B -->|No| D[End]
\`\`\``,
      },
    });

    // Navigate directly to the document.
    cy.visit("/editor/cypress-mermaid-rt?collab=0");
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");
    cy.get(".mermaid-widget", { timeout: 10000 }).should("be.visible");

    // Trigger auto-save by waiting.
    cy.wait(3000);

    // Fetch the document from the API.
    cy.request("/api/documents/cypress-mermaid-rt").then((response) => {
      const content = response.body.content as string;
      expect(content).to.include("```mermaid");
      expect(content).to.include("graph TD");
      expect(content).to.include("A[Start] --> B{Decision}");
    });

    // Cleanup.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-rt",
      failOnStatusCode: false,
    });
  });

  it("non-mermaid code blocks render normally", () => {
    // Use the API to create a document with a regular code block.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-code",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: {
        id: "cypress-mermaid-code",
        content: `# Code Test

\`\`\`javascript
const x = 42;
console.log(x);
\`\`\``,
      },
    });

    // Navigate directly to the document.
    cy.visit("/editor/cypress-mermaid-code?collab=0");
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");

    // The regular code block should render.
    cy.get(".ProseMirror pre code", { timeout: 5000 })
      .first()
      .should("contain", "const x = 42;");

    // No mermaid widget should be present.
    cy.get(".mermaid-widget").should("not.exist");

    // Cleanup.
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-mermaid-code",
      failOnStatusCode: false,
    });
  });
});
