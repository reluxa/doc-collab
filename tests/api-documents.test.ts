import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BASE = "http://localhost:3000";

describe("API: GET /api/documents (list)", () => {
  it("returns empty array when no documents exist", async () => {
    const res = await fetch(`${BASE}/api/documents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns documents with id, title, modifiedAt", async () => {
    // Create a document first.
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-test-1", content: "# API Test\n\nBody" }),
    });

    const res = await fetch(`${BASE}/api/documents`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const found = data.find((d: { id: string }) => d.id === "api-test-1");
    expect(found).toBeDefined();
    expect(found.title).toBe("API Test");
    expect(found.modifiedAt).toBeDefined();

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-test-1`, { method: "DELETE" });
  });
});

describe("API: POST /api/documents (create)", () => {
  it("creates a document and returns 201 with ETag", async () => {
    const res = await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-create-test", content: "# New Doc" }),
    });

    expect(res.status).toBe(201);
    expect(res.headers.get("ETag")).toMatch(/^"[a-f0-9]{64}"$/);

    const data = await res.json();
    expect(data.id).toBe("api-create-test");
    expect(data.content).toBe("# New Doc");
    expect(data.etag).toMatch(/^"[a-f0-9]{64}"$/);

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-create-test`, { method: "DELETE" });
  });

  it("returns 409 when document already exists", async () => {
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-dup-test", content: "first" }),
    });

    const res = await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-dup-test", content: "second" }),
    });

    expect(res.status).toBe(409);

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-dup-test`, { method: "DELETE" });
  });

  it("returns 400 for invalid id", async () => {
    const res = await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "../../bad", content: "x" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("API: GET /api/documents/[id] (read)", () => {
  it("returns document content and ETag header", async () => {
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-read-test", content: "# Read Me" }),
    });

    const res = await fetch(`${BASE}/api/documents/api-read-test`);
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toMatch(/^"[a-f0-9]{64}"$/);

    const data = await res.json();
    expect(data.id).toBe("api-read-test");
    expect(data.content).toBe("# Read Me");

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-read-test`, { method: "DELETE" });
  });

  it("returns 404 for nonexistent document", async () => {
    const res = await fetch(`${BASE}/api/documents/nonexistent-doc-xyz`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for path traversal id", async () => {
    const res = await fetch(
      `${BASE}/api/documents/..%2F..%2Fetc%2Fpasswd`,
    );
    expect(res.status).toBe(400);
  });
});

describe("API: PUT /api/documents/[id] (update)", () => {
  it("succeeds with matching If-Match and returns new ETag", async () => {
    // Create.
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "api-put-test",
        content: "# Original",
      }),
    });

    // Read to get ETag.
    const getRes = await fetch(`${BASE}/api/documents/api-put-test`);
    const etag = getRes.headers.get("ETag")!;

    // Update with matching ETag.
    const putRes = await fetch(`${BASE}/api/documents/api-put-test`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify({ content: "# Updated" }),
    });

    expect(putRes.status).toBe(200);
    expect(putRes.headers.get("ETag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(putRes.headers.get("ETag")).not.toBe(etag);

    const data = await putRes.json();
    expect(data.content).toBe("# Updated");

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-put-test`, { method: "DELETE" });
  });

  it("returns 428 when If-Match is missing", async () => {
    const res = await fetch(`${BASE}/api/documents/welcome`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "# No ETag" }),
    });

    expect(res.status).toBe(428);
  });

  it("returns 409 with stale If-Match", async () => {
    // Create.
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "api-conflict-test",
        content: "# v1",
      }),
    });

    // Get ETag.
    const getRes = await fetch(`${BASE}/api/documents/api-conflict-test`);
    const etag = getRes.headers.get("ETag")!;

    // Modify the file directly (simulate concurrent writer).
    const { DOCS_ROOT } = await import("@/lib/config");
    fs.writeFileSync(
      path.join(DOCS_ROOT, "api-conflict-test.md"),
      "# modified by another writer",
      "utf-8",
    );

    // Try to update with stale ETag.
    const putRes = await fetch(`${BASE}/api/documents/api-conflict-test`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify({ content: "# my update" }),
    });

    expect(putRes.status).toBe(409);
    const conflictData = await putRes.json();
    expect(conflictData.error).toBeDefined();
    // Response should include current content + ETag for reconciliation.
    expect(conflictData.content).toBe("# modified by another writer");
    expect(conflictData.etag).toBeDefined();

    // Cleanup.
    await fetch(`${BASE}/api/documents/api-conflict-test`, { method: "DELETE" });
  });
});

describe("API: DELETE /api/documents/[id]", () => {
  it("deletes a document and returns 204", async () => {
    await fetch(`${BASE}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "api-del-test", content: "gone" }),
    });

    const res = await fetch(`${BASE}/api/documents/api-del-test`, {
      method: "DELETE",
    });

    expect(res.status).toBe(204);

    // Verify it's gone.
    const getRes = await fetch(`${BASE}/api/documents/api-del-test`);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for nonexistent document", async () => {
    const res = await fetch(`${BASE}/api/documents/no-such-doc`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
