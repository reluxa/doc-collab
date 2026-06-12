/// <reference types="cypress" />

// Helper: click a toolbar button by its aria-label.
function toolbarButton(label: string) {
  return cy.get(`button[aria-label="${label}"]`);
}

// Helper: type text then select all of it.
function typeAndSelect(text: string) {
  cy.get(".ProseMirror").click();
  cy.get(".ProseMirror").type(text);
  // Triple-click to select the paragraph, or use Ctrl+A.
  cy.get(".ProseMirror").type("{ctrl}a");
}

describe("Editor toolbar", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-test",
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: "cypress-test", content: "# Test Doc\n\nStart typing here." },
    });
    cy.visit("/editor/cypress-test");
    cy.get(".ProseMirror", { timeout: 15000 }).should("be.visible");
    cy.get(".ProseMirror").click();
    // Clear existing content.
    cy.get(".ProseMirror").type("{ctrl}a{backspace}");
  });

  afterEach(() => {
    cy.request({
      method: "DELETE",
      url: "/api/documents/cypress-test",
      failOnStatusCode: false,
    });
  });

  // -- Headings --

  it("applies H1 heading", () => {
    typeAndSelect("Hello H1");
    toolbarButton("Heading 1").trigger("mousedown", { force: true });
    cy.get(".ProseMirror h1").should("contain", "Hello H1");
  });

  it("applies H2 heading", () => {
    typeAndSelect("Hello H2");
    toolbarButton("Heading 2").trigger("mousedown", { force: true });
    cy.get(".ProseMirror h2").should("contain", "Hello H2");
  });

  it("applies H3 heading", () => {
    typeAndSelect("Hello H3");
    toolbarButton("Heading 3").trigger("mousedown", { force: true });
    cy.get(".ProseMirror h3").should("contain", "Hello H3");
  });

  // -- Inline marks --

  it("applies bold", () => {
    typeAndSelect("bold text");
    toolbarButton("Bold").trigger("mousedown", { force: true });
    cy.get(".ProseMirror strong").should("contain", "bold text");
  });

  it("applies italic", () => {
    typeAndSelect("italic text");
    toolbarButton("Italic").trigger("mousedown", { force: true });
    cy.get(".ProseMirror em").should("contain", "italic text");
  });

  it("applies underline", () => {
    typeAndSelect("underlined text");
    toolbarButton("Underline").trigger("mousedown", { force: true });
    cy.get(".ProseMirror").should("contain", "underlined text");
  });

  it("applies strikethrough", () => {
    typeAndSelect("deleted text");
    toolbarButton("Strikethrough").trigger("mousedown", { force: true });
    cy.get(".ProseMirror s").should("contain", "deleted text");
  });

  it("applies inline code", () => {
    typeAndSelect("code here");
    toolbarButton("Inline code").trigger("mousedown", { force: true });
    cy.get(".ProseMirror code").should("contain", "code here");
  });

  // -- Lists --

  it("applies bullet list", () => {
    typeAndSelect("list item");
    toolbarButton("Bullet list").trigger("mousedown", { force: true });
    cy.get(".ProseMirror ul").should("exist");
  });

  it("applies ordered list", () => {
    typeAndSelect("numbered item");
    toolbarButton("Numbered list").trigger("mousedown", { force: true });
    cy.get(".ProseMirror ol").should("exist");
  });

  it("applies task list", () => {
    typeAndSelect("task item");
    toolbarButton("Task list").trigger("mousedown", { force: true });
    cy.get('[data-type="taskList"]').should("exist");
  });

  // -- Blocks --

  it("applies blockquote", () => {
    typeAndSelect("quoted text");
    toolbarButton("Blockquote").trigger("mousedown", { force: true });
    cy.get(".ProseMirror blockquote").should("contain", "quoted text");
  });

  it("applies code block", () => {
    typeAndSelect("some code");
    toolbarButton("Code block").trigger("mousedown", { force: true });
    cy.get(".ProseMirror pre").should("exist");
  });

  it("inserts a table", () => {
    cy.get(".ProseMirror").click();
    toolbarButton("Insert table").trigger("mousedown", { force: true });
    cy.get(".ProseMirror table").should("exist");
  });

  it("inserts horizontal rule", () => {
    cy.get(".ProseMirror").click();
    toolbarButton("Horizontal rule").trigger("mousedown", { force: true });
    cy.get(".ProseMirror hr").should("exist");
  });

  // -- Insert --

  it("applies highlight", () => {
    typeAndSelect("highlight me");
    toolbarButton("Highlight").trigger("mousedown", { force: true });
    cy.get(".ProseMirror mark").should("contain", "highlight me");
  });

  // -- Save --

  it("saves changes and persists to disk", () => {
    cy.get(".ProseMirror").type("Fresh content{enter}{enter}New paragraph");
    cy.contains("button", "Save").click();
    cy.contains("Saved").should("be.visible");

    cy.request("/api/documents/cypress-test").then((resp) => {
      expect(resp.body.content).to.contain("Fresh content");
      expect(resp.body.content).to.contain("New paragraph");
    });
  });
});

describe("Document list", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request("GET", "/api/documents").then((resp) => {
      resp.body.forEach((doc: { id: string }) => {
        if (doc.id.startsWith("cypress-")) {
          cy.request({
            method: "DELETE",
            url: `/api/documents/${doc.id}`,
            failOnStatusCode: false,
          });
        }
      });
    });
    cy.visit("/");
  });

  it("lists existing documents", () => {
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: "cypress-visible", content: "# Visible Doc" },
    });
    cy.visit("/");
    cy.contains("Visible Doc").should("be.visible");
  });

  it("creates a new document from the dialog", () => {
    cy.contains("New").click();
    cy.get('input[id="doc-name"]').type("cypress-new-doc");
    cy.contains("button", "Create").click();
    cy.url().should("include", "/editor/cypress-new-doc");
  });

  it("deletes a document", () => {
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: "cypress-delete-me", content: "# Delete Me" },
    });
    cy.visit("/");
    cy.contains("Delete Me").should("be.visible");
    // Click trash icon on the document card.
    cy.get('[aria-label*="Delete"]').first().click({ force: true });
    // Wait for and confirm in the delete dialog.
    cy.get('[role="dialog"]').should("be.visible");
    cy.get('[role="dialog"]')
      .contains("button", "Delete", { matchCase: true })
      .click();
    cy.contains("Delete Me").should("not.exist");
  });
});
