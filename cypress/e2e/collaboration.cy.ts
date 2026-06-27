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
      failOnStatusCode: false,
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

  it("merges edits in different sections without interference", () => {
    const tag = `${UNIQUE_PREFIX}-sections-${Date.now()}`;
    const sectionABody = `Body A ${tag}`;
    const sectionBBody = `Body B ${tag}`;

    visitCollabEditor();
    waitForCollabConnected();
    clearEditor();

    cy.task("collabSetTwoSectionDocument", {
      documentId: COLLAB_DOC_ID,
      sectionABody,
      sectionBBody,
    });

    cy.get(".ProseMirror", { timeout: 10_000 }).should("contain.text", sectionBBody);

    // Click directly on section B's <p> so the cursor lands inside that paragraph.
    cy.get(".ProseMirror").contains("p", sectionBBody).click();
    cy.get(".ProseMirror").type(" edited-in-browser");

    // Wait for the typed text to be fully settled in the CRDT before
    // applying a remote concurrent edit — prevents a race where the collab
    // task fires before keystrokes finish integrating into Yjs.
    cy.get(".ProseMirror").should("contain.text", "edited-in-browser");

    cy.task("collabReplaceParagraphAt", {
      documentId: COLLAB_DOC_ID,
      paragraphIndex: 0,
      text: `${sectionABody} edited-by-remote`,
    });

    cy.get(".ProseMirror", { timeout: 10_000 }).should("contain.text", "edited-by-remote");
    cy.get(".ProseMirror").should("contain.text", "edited-in-browser");
    cy.get(".ProseMirror").should("contain.text", sectionBBody);
    cy.contains("This document was changed elsewhere").should("not.exist");

    cy.task("collabReadPlainText", { documentId: COLLAB_DOC_ID }).then((plain) => {
      expect(plain).to.include("edited-by-remote");
      expect(plain).to.include("edited-in-browser");
    });
  });

  it("merges offline edits after reconnect via y-indexeddb", () => {
    const offlineDocId = `${COLLAB_DOC_ID}-offline`;
    const offlineText = `${UNIQUE_PREFIX}-offline-${Date.now()}`;

    cy.request({
      method: "DELETE",
      url: `/api/documents/${offlineDocId}`,
      failOnStatusCode: false,
    });
    cy.request({
      method: "POST",
      url: "/api/documents",
      body: { id: offlineDocId, content: "" },
    });

    cy.visit(`/editor/${offlineDocId}?collab=1`);
    cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
    waitForCollabConnected();
    clearEditor();
    cy.get(".ProseMirror").type(`${offlineText}-online`);

    // Reload with collab WebSocket blocked — y-indexeddb restores local Y.Doc state.
    cy.visit(`/editor/${offlineDocId}?collab=1`, {
      onBeforeLoad(win) {
        const OriginalWebSocket = win.WebSocket;
        cy.stub(win, "WebSocket").callsFake((url: string | URL, protocols?: string | string[]) => {
          if (String(url).includes("/ws/collab")) {
            const socket = {
              readyState: 3,
              close() {},
              send() {},
              addEventListener() {},
              removeEventListener() {},
            };
            return socket as unknown as WebSocket;
          }
          return new OriginalWebSocket(url, protocols);
        });
      },
    });

    cy.get(".ProseMirror", { timeout: 20_000 }).should("contain.text", `${offlineText}-online`);
    cy.get(".ProseMirror").click().type(` ${offlineText}-offline`);

    // Reconnect for real and sync buffered edits to the server.
    cy.visit(`/editor/${offlineDocId}?collab=1`);
    cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
    waitForCollabConnected();

    cy.get(".ProseMirror").should("contain.text", `${offlineText}-offline`);
    cy.task("collabReadPlainText", { documentId: offlineDocId }).should(
      "include",
      `${offlineText}-offline`,
    );

    cy.request({
      method: "DELETE",
      url: `/api/documents/${offlineDocId}`,
      failOnStatusCode: false,
    });
  });
});
