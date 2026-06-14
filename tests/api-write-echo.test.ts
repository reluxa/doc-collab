import { describe, it, expect, beforeEach } from "vitest";

import {
  isApiWriteEcho,
  markApiWrite,
  resetApiWriteEcho,
} from "@/lib/api-write-echo";

describe("api-write-echo", () => {
  beforeEach(() => {
    resetApiWriteEcho();
  });

  it("treats recent API writes as echoes by etag", () => {
    markApiWrite("doc-a", '"etag-v1"');
    expect(isApiWriteEcho("doc-a", '"etag-v1"')).toBe(true);
    expect(isApiWriteEcho("doc-a", '"etag-v2"')).toBe(false);
    expect(isApiWriteEcho("doc-b", '"etag-v1"')).toBe(false);
  });
});
