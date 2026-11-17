import { describe, expect, it } from "vitest";
import { parseFeed, personalDetailsIn } from "@/server/precedents";

const FEED = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:tna="https://caselaw.nationalarchives.gov.uk">
<link href="https://caselaw.nationalarchives.gov.uk/atom.xml?query=x&amp;per_page=10&amp;page=4" rel="last"/>
<entry><title>Smith v Jones &amp; Co</title><link href="https://caselaw.nationalarchives.gov.uk/eat/2026/162" rel="alternate"/>
<published>2026-10-21T00:00:00+00:00</published><author><name>Employment Appeal Tribunal</name></author>
<tna:identifier slug="eat/2026/162" type="ukncn">[2026] EAT 162</tna:identifier></entry>
<entry><title>Elsewhere</title><link href="https://example.com/x" rel="alternate"/></entry>
</feed>`;

describe("precedent search", () => {
  it("reads judgments from a Find Case Law feed and ignores links elsewhere", () => {
    const { results, total } = parseFeed(FEED);
    expect(results).toEqual([{ title: "Smith v Jones & Co", citation: "[2026] EAT 162", court: "Employment Appeal Tribunal", date: "2026-10-21", url: "https://caselaw.nationalarchives.gov.uk/eat/2026/162" }]);
    expect(total).toBe(40);
  });

  it("refuses search terms that carry personal details", () => {
    expect(personalDetailsIn("unfair dismissal gross misconduct")).toBe(false);
    expect(personalDetailsIn("sam@example.com dismissal")).toBe(true);
    expect(personalDetailsIn("07700 900123 harassment")).toBe(true);
  });
});
