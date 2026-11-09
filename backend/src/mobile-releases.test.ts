import { describe, expect, it } from "bun:test";
import { isPublicMobileAppReleaseRequest } from "./mobile-releases";

describe("mobile app release access", () => {
  it("allows public checks and downloads", () => {
    const latestRequest = new Request("https://example.test/api/app-releases/latest");
    const downloadRequest = new Request(
      "https://example.test/api/app-releases/12/download",
    );

    expect(
      isPublicMobileAppReleaseRequest(latestRequest, new URL(latestRequest.url)),
    ).toBe(true);
    expect(
      isPublicMobileAppReleaseRequest(
        downloadRequest,
        new URL(downloadRequest.url),
      ),
    ).toBe(true);
  });

  it("keeps release administration private", () => {
    const listRequest = new Request(
      "https://example.test/api/app-releases/admin",
    );
    const publishRequest = new Request(
      "https://example.test/api/app-releases/admin",
      { method: "POST" },
    );
    const editRequest = new Request(
      "https://example.test/api/app-releases/admin/12",
      { method: "PATCH" },
    );
    const deleteRequest = new Request(
      "https://example.test/api/app-releases/admin/12",
      { method: "DELETE" },
    );

    expect(
      isPublicMobileAppReleaseRequest(listRequest, new URL(listRequest.url)),
    ).toBe(false);
    expect(
      isPublicMobileAppReleaseRequest(
        publishRequest,
        new URL(publishRequest.url),
      ),
    ).toBe(false);
    expect(
      isPublicMobileAppReleaseRequest(editRequest, new URL(editRequest.url)),
    ).toBe(false);
    expect(
      isPublicMobileAppReleaseRequest(
        deleteRequest,
        new URL(deleteRequest.url),
      ),
    ).toBe(false);
  });
});
