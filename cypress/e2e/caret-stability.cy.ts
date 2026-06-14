/// <reference types="cypress" />

/**
 * Regression tests for caret stability and false conflict banners while typing.
 */

const PHASE1_DOC_ID = "cypress-caret-phase1";
const COLLAB_DOC_ID = "cypress-caret-collab";
const FALSE_CONFLICT_DOC_ID = "cypress-false-conflict";

/** Text offset of the caret within `.ProseMirror` (0 = start of document text). */
function getCaretTextOffset(): Cypress.Chainable<number> {
  return cy.get(".ProseMirror").then(($pm) => {
    const root = $pm[0];
    const view = root.ownerDocument?.defaultView;
    const sel = view?.getSelection();
    if (!sel || sel.rangeCount === 0) {
      throw new Error("No selection in ProseMirror");
    }

    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      throw new Error("Selection is outside ProseMirror");
    }

    const walker = root.ownerDocument!.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
    );
    let offset = 0;
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node === range.startContainer) {
        return offset + range.startOffset;
      }
      offset += (node.textContent ?? "").length;
      node = walker.nextNode();
    }
    throw new Error("Could not resolve caret text offset");
  });
}

function proseMirrorPlainText(): Cypress.Chainable<string> {
  return cy
    .get(".ProseMirror")
    .invoke("text")
    .then((text) => text.replace(/\u00a0/g, " ").replace(/\s+/g, ""));
}

function setupDocument(id: string, content = "") {
  cy.request({
    method: "DELETE",
    url: `/api/documents/${id}`,
    failOnStatusCode: false,
  });
  cy.request({
    method: "POST",
    url: "/api/documents",
    body: { id, content },
  });
}

function waitForDiskContent(id: string, substring: string) {
  cy.wait(600);
  cy.request("GET", `/api/documents/${id}`, { retryOnStatusCodeFailure: true }).then(
    (resp) => {
      expect(resp.body.content.replace(/\s+/g, "")).to.contain(substring);
    },
  );
}

function focusProseMirror() {
  cy.get(".ProseMirror").focus();
}

function teardownDocument(id: string) {
  cy.request({
    method: "DELETE",
    url: `/api/documents/${id}`,
    failOnStatusCode: false,
  });
}

function insertInMiddle(
  base: string,
  stepsFromEnd: number,
  insertion: string,
  typeOptions?: Partial<Cypress.TypeOptions>,
) {
  cy.get(".ProseMirror").click();
  cy.get(".ProseMirror").type(base);
  cy.get(".ProseMirror").type("{leftArrow}".repeat(stepsFromEnd));
  getCaretTextOffset().should("eq", base.length - stepsFromEnd);
  cy.get(".ProseMirror").type(insertion, typeOptions);
}

describe("False conflict banner — Phase 1 auto-save echo", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    setupDocument(FALSE_CONFLICT_DOC_ID, "# Demo\n\n");
    cy.visit(`/editor/${FALSE_CONFLICT_DOC_ID}?collab=0`);
    cy.get(".ProseMirror", { timeout: 15_000 }).should("be.visible");
    cy.get(".ProseMirror").click();
  });

  afterEach(() => {
    teardownDocument(FALSE_CONFLICT_DOC_ID);
  });

  it("does not show a conflict banner while typing across save debounces", () => {
    // Reproduces story13-demo: type a line, new paragraph, keep typing while auto-save runs.
    cy.get(".ProseMirror").type("Hello workd", { delay: 40 });
    cy.get(".ProseMirror").type("{enter}{enter}th", { delay: 500 });

    cy.wait(800);

    cy.contains("This document was changed elsewhere").should("not.exist");
    cy.contains('[aria-live="polite"]', "Error").should("not.exist");
    proseMirrorPlainText().should("contain", "Helloworkd");
    proseMirrorPlainText().should("contain", "th");
  });

  it("does not show a conflict banner during overlapping auto-saves", () => {
    cy.get(".ProseMirror").type("Line one", { delay: 30 });
    cy.get(".ProseMirror").type("{enter}{enter}Line two", { delay: 500 });
    cy.get(".ProseMirror").type("{enter}{enter}Line three", { delay: 500 });

    cy.wait(1500);

    cy.contains("This document was changed elsewhere").should("not.exist");
    cy.contains('[aria-live="polite"]', "Error").should("not.exist");
  });
});

describe("Caret stability — Phase 1 editor", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    setupDocument(PHASE1_DOC_ID);
    cy.visit(`/editor/${PHASE1_DOC_ID}?collab=0`);
    cy.get(".ProseMirror", { timeout: 15_000 }).should("be.visible");
    cy.get(".ProseMirror").click();
    cy.get(".ProseMirror").type("{ctrl}a{backspace}");
  });

  afterEach(() => {
    teardownDocument(PHASE1_DOC_ID);
  });

  it("keeps the caret mid-document when auto-save fires during insertion", () => {
    insertInMiddle("ABCDEF", 3, "XY", { delay: 500 });

    proseMirrorPlainText().should("eq", "ABCXYDEF");
    getCaretTextOffset().should("eq", 5);
    proseMirrorPlainText().should("not.eq", "ABCDEFXY");
  });

  it("keeps the caret mid-document after its own save echoes via the file watcher", () => {
    insertInMiddle("ABCDEF", 3, "XY", { delay: 500 });

    waitForDiskContent(PHASE1_DOC_ID, "ABCXYDEF");
    getCaretTextOffset().should("eq", 5);

    focusProseMirror();
    cy.get(".ProseMirror").type("Z");
    proseMirrorPlainText().should("eq", "ABCXYZDEF");
    getCaretTextOffset().should("eq", 6);
  });
});

describe("Caret stability — collaborative editor (solo, no peer)", () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    setupDocument(COLLAB_DOC_ID);
    cy.visit(`/editor/${COLLAB_DOC_ID}?collab=1`);
    cy.get(".ProseMirror", { timeout: 20_000 }).should("be.visible");
    cy.contains('[aria-live="polite"]', "Collaborative", { timeout: 20_000 }).should(
      "be.visible",
    );
    cy.contains('[aria-live="polite"]', "Synced", { timeout: 20_000 }).should(
      "be.visible",
    );
    cy.get(".ProseMirror").click();
    cy.get(".ProseMirror").type("{ctrl}a{backspace}");
  });

  afterEach(() => {
    teardownDocument(COLLAB_DOC_ID);
  });

  it("keeps the caret mid-document when Hocuspocus persist echoes during typing", () => {
    insertInMiddle("ABCDEF", 3, "XY", { delay: 500 });

    proseMirrorPlainText().should("eq", "ABCXYDEF");
    getCaretTextOffset().should("eq", 5);
    proseMirrorPlainText().should("not.eq", "ABCDEFXY");

    cy.contains("This document was changed elsewhere").should("not.exist");
  });

  it("keeps the caret mid-document after persist flush to disk", () => {
    insertInMiddle("ABCDEF", 3, "XY", { delay: 500 });

    getCaretTextOffset().should("eq", 5);
    waitForDiskContent(COLLAB_DOC_ID, "ABCXYDEF");
    getCaretTextOffset().should("eq", 5);

    focusProseMirror();
    cy.get(".ProseMirror").type("Z");
    proseMirrorPlainText().should("eq", "ABCXYZDEF");

    waitForDiskContent(COLLAB_DOC_ID, "ABCXYZDEF");
  });
});
