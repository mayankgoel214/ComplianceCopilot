import { DEMO_DOCUMENT, DEMO_PROJECT_DESCRIPTION } from "@/lib/demo/fixture";

import AssessClient from "./assess-client";

/**
 * Server wrapper, so the sample document reaches the page as data rather than
 * through an extra round trip. It is a build-time constant; fetching it would
 * be a request to learn something the bundle already knows.
 */
export const metadata = {
  title: "Assess a document",
  description:
    "Run the compliance pipeline over a document and see every finding with the regulation it cites, verified against the source.",
};

export default function AssessPage() {
  return (
    <AssessClient sampleDocument={DEMO_DOCUMENT} sampleDescription={DEMO_PROJECT_DESCRIPTION} />
  );
}
