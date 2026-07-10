---
id: glints
title: Glints Extractor
description: Southeast Asia job discovery from Glints via GraphQL with Playwright fallback.
sidebar_position: 14
---

## What it is

Original website: [Glints](https://glints.com/)

This extractor discovers jobs from Glints across Singapore, Indonesia, Malaysia, and Vietnam. It posts to the public `searchJobsV3` GraphQL endpoint first, then falls back to a Camoufox/Playwright browser context when Glints' WAF blocks plain HTTP.

Implementation split:

1. `extractors/glints/src/run.ts` loops search terms, paginates GraphQL results, dedupes by job id, and maps rows into `CreateJobInput`.
2. `extractors/glints/src/fetcher.ts` attempts HTTP GraphQL; `browser-fetcher.ts` retries from a browser page when blocked.
3. `extractors/glints/manifest.ts` gates to SEA countries, adapts pipeline settings, emits progress, and registers the source for runtime discovery.

## Why it exists

Glints is a major SEA job board that broad aggregators often under-cover. A first-party extractor lets pipeline runs target Singapore, Indonesia, Malaysia, and Vietnam without requiring Apify credentials.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Select one of: **Singapore**, **Indonesia**, **Malaysia**, or **Vietnam**.
3. Leave **Glints** enabled in **Sources** or toggle it on.
4. Enter search terms such as:
   ```text
   software engineer
   backend engineer
   platform engineer
   ```
5. Start the run and monitor list-page progress in the pipeline progress card.

Defaults and constraints:

- The extractor only returns jobs when the selected country is one of the four SEA markets above.
- `GLINTS_MAX_JOBS_PER_TERM` (settings key `glintsMaxJobsPerTerm`) controls the default per-term cap; automatic run budgets can override it.
- No API credentials are required.
- Job URLs point at the Glints opportunity page for the selected locale (for example `/sg/opportunities/jobs/{id}`).
- When Cloudflare/WAF challenges cannot be solved headlessly, the extractor returns `challengeRequired` so the pipeline can pause for a headed solve.

## Common problems

### Glints does not run

- Confirm the selected country is Singapore, Indonesia, Malaysia, or Vietnam.
- Check that the app build includes `extractors/glints/manifest.ts` and the shared `glints` source metadata.
- In Docker, confirm `COPY extractors/glints` appears in the image (see deployment tests).

### Health check fails with 503

- Glints frequently WAF-blocks datacenter IPs and headless browsers. The extractor falls back to Playwright and can pause for a VNC challenge solve (which starts Xvfb before launching headed Camoufox).
- Glints uses a custom firewall page, not Cloudflare — after Solve, Job Ops persists the headed session cookies/User-Agent even when no `cf_clearance` cookie exists.
- Retry `GET /api/glints/health` after cookies have been persisted under the cloudflare cookie storage dir.

### Solve fails with "no reusable Cloudflare clearance cookie"

- This used to happen because the shared solver required `cf_clearance` even for Glints' non-Cloudflare firewall.
- Current builds treat Glints firewall as a non-CF wait page and accept a headed session without clearance. Redeploy/restart so the updated `browser-utils` solver is loaded.

### Results look incomplete

- Lower `glintsMaxJobsPerTerm` or raise the automatic run budget if you need more listings.
- Pagination stops when `hasMore` is false or the per-term cap is reached.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
