/// <reference types="cypress" />

const DOC_ID = "cypress-version-open-test";
const CONTENT = "# Version Open Test\n\n<!-- sec:body -->\n\nBaseline body.";

function visitCollabEditor() {
  cy.visit(`/editor/${DOC_ID}?collab=1`);
  cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
}

function waitForCollabConnected() {
  cy.contains('[aria-live="polite"]', "Collaborative", { timeout: 20_000 }).should(
    "be.visible",
  );
  cy.contains('[aria-live="polite"]', "Synced", { timeout: 20_000 }).should("be.visible");
}

function getVersionCount(): Cypress.Chainable<number> {
  return cy
    .request("GET", `/api/documents/${DOC_ID}/versions`)
    .then((res) => {
      expect(res.status).to.eq(200);
      return res.body.length as number;
    });
}

/** Wait for Hocuspocus persist debounce (400ms) plus margin. */
function waitForPersistFlush() {
  cy.wait(2_000);
}

describe("Version history — open without edits", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request({
      method: "DELETE",
      url: `/api/documents/${DOC_ID}`,
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: DOC_ID, content: CONTENT },
    });
    // Seed a baseline version from disk content.
    cy.request("POST", `/api/documents/${DOC_ID}/versions`).then((res) => {
      expect(res.status).to.eq(200);
    });
    // Align in-memory Y.Doc with disk (same as other collab specs).
    cy.task("mcpUpdateDocument", {
      documentId: DOC_ID,
      markdown: CONTENT,
    });
    waitForPersistFlush();
    getVersionCount().then((count) => {
      cy.wrap(count).as("baselineVersionCount");
    });
  });

  afterEach(() => {
    cy.request({
      method: "DELETE",
      url: `/api/documents/${DOC_ID}`,
      failOnStatusCode: false,
    });
  });

  it("does not create a version when opening collab editor without edits", () => {
    cy.get<number>("@baselineVersionCount").then((baseline) => {
      visitCollabEditor();
      waitForCollabConnected();
      waitForPersistFlush();
      getVersionCount().should("eq", baseline);
    });
  });

  it("does not create a version when reopening collab editor without edits", () => {
    cy.get<number>("@baselineVersionCount").then((baseline) => {
      visitCollabEditor();
      waitForCollabConnected();
      waitForPersistFlush();

      cy.visit("/");
      cy.url().should("include", "/");

      visitCollabEditor();
      waitForCollabConnected();
      waitForPersistFlush();

      getVersionCount().should("eq", baseline);
    });
  });

  it("does not create a version when opening REST editor without edits", () => {
    cy.get<number>("@baselineVersionCount").then((baseline) => {
      cy.visit(`/editor/${DOC_ID}?collab=0`);
      cy.get(".ProseMirror", { timeout: 15_000 }).should("be.visible");
      cy.get(".ProseMirror").should("contain.text", "Baseline body");
      waitForPersistFlush();

      getVersionCount().should("eq", baseline);
    });
  });
});
