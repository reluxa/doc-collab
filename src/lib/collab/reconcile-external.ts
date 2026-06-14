/**
 * Reconcile external `.md` file changes into the live Hocuspocus `Y.Doc`.
 */

import * as fs from "node:fs/promises";

import { resolveDocPath } from "../security";
import { createHocuspocus } from "./hocuspocus";
import { isPersistenceEcho } from "./persist-echo";
import { reconcileExternalMarkdownIntoDoc } from "./agent-document";

/**
 * Merge a disk `.md` change into the in-memory collaborative document.
 * No-ops when the change is a persistence echo.
 */
export async function reconcileDocumentFromDisk(
  documentId: string,
  diskMarkdown?: string,
): Promise<number> {
  const mdPath = resolveDocPath(documentId);
  const markdown =
    diskMarkdown ?? (await fs.readFile(mdPath, "utf-8"));

  if (isPersistenceEcho(documentId, markdown)) {
    return 0;
  }

  const hocuspocus = createHocuspocus();
  const connection = await hocuspocus.openDirectConnection(documentId, {
    source: "external-reconcile",
  });

  try {
    await connection.transact((doc) => {
      reconcileExternalMarkdownIntoDoc(doc, documentId, markdown);
    });
    return 1;
  } finally {
    await connection.disconnect({ unloadImmediately: false });
  }
}
