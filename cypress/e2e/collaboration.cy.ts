/// <reference types="cypress" />

const COLLAB_DOC_ID = "cypress-collab-test";
const UNIQUE_PREFIX = "cypress-collab";

function visitCollabEditor() {
  cy.visit(`/editor/${COLLAB_DOC_ID}?collab=1`);
  cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
}

function waitForCollabConnected() {
  cy.contains('[aria-live="polite"]', "Collaborative", { timeout: 20_000 }).should("be.visible");
  cy.contains('[aria-live="polite"]', "Synced", { timeout: 20_000 }).should("be.visible");
}

function clearEditor() {
  cy.get(".ProseMirror").click();
  cy.get(".ProseMirror").type("{ctrl}a{backspace}");
}

describe("Collaborative editing", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.request({
      method: "DELETE",
      url: `/api/documents/${COLLAB_DOC_ID}`,
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: COLLAB_DOC_ID, content: "" },
    });
  });

  afterEach(() => {
    cy.request({
      method: "DELETE",
      url: `/api/documents/${COLLAB_DOC_ID}`,
      failOnStatusCode: false,
    });
  });

  it("connects in collaborative mode with presence UI", () => {
    visitCollabEditor();
    waitForCollabConnected();
    cy.get('[aria-label="1 collaborator online"]').should("be.visible");
    cy.contains("button", "Save").should("not.exist");
  });

  it("syncs remote peer edits into the browser editor", () => {
    visitCollabEditor();
    waitForCollabConnected();

    const remoteText = `${UNIQUE_PREFIX}-remote-${Date.now()}`;
    cy.task("collabSetContent", { documentId: COLLAB_DOC_ID, text: remoteText });

    cy.get(".ProseMirror", { timeout: 10_000 }).should("contain.text", remoteText);
    cy.contains("This document was changed elsewhere").should("not.exist");
  });

  it("propagates browser edits to a remote peer", () => {
    visitCollabEditor();
    waitForCollabConnected();
    clearEditor();

    const browserText = `${UNIQUE_PREFIX}-browser-${Date.now()}`;
    cy.get(".ProseMirror").type(browserText);

    cy.task("collabReadPlainText", { documentId: COLLAB_DOC_ID }).should(
      "include",
      browserText,
    );
  });

  it("merges concurrent edits from browser and remote peer without conflict", () => {
    visitCollabEditor();
    waitForCollabConnected();
    clearEditor();

    const browserText = `${UNIQUE_PREFIX}-merge-a-${Date.now()}`;
    const remoteText = `${UNIQUE_PREFIX}-merge-b-${Date.now()}`;

    cy.get(".ProseMirror").type(browserText);
    cy.task("collabAppendParagraph", { documentId: COLLAB_DOC_ID, text: remoteText });

    cy.get(".ProseMirror", { timeout: 10_000 }).should("contain.text", browserText);
    cy.get(".ProseMirror").should("contain.text", remoteText);
    cy.contains("This document was changed elsewhere").should("not.exist");

    cy.task("collabReadPlainText", { documentId: COLLAB_DOC_ID }).then((plain) => {
      expect(plain).to.include(browserText);
      expect(plain).to.include(remoteText);
    });
  });

  it("persists collaborative edits to disk", () => {
    visitCollabEditor();
    waitForCollabConnected();
    clearEditor();

    const persistedText = `${UNIQUE_PREFIX}-persist-${Date.now()}`;
    cy.get(".ProseMirror").type(persistedText);

    // Hocuspocus debounces persistence (400 ms); allow headroom for CI.
    cy.wait(1500);

    cy.request("GET", `/api/documents/${COLLAB_DOC_ID}`).then((resp) => {
      expect(resp.body.content).to.contain(persistedText);
    });
  });
});
