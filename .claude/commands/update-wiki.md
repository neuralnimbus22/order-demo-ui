---
description: Surgically refresh openwiki/ from source changes since the last wiki update (never touches CLAUDE.md rules)
---

You are refreshing this repository's OpenWiki-format documentation under `openwiki/`.
Do a **surgical** update, not a rewrite. Follow these steps exactly.

## 1. Find the change window

Determine the last commit that touched the wiki, and diff the source since then:

```bash
LAST_WIKI_COMMIT=$(git log -1 --format=%H -- openwiki/)
echo "last wiki commit: $LAST_WIKI_COMMIT"
git diff --stat "$LAST_WIKI_COMMIT"..HEAD -- . ':(exclude)openwiki'
git diff "$LAST_WIKI_COMMIT"..HEAD -- app lib components app/api k8s .github Dockerfile next.config.ts package.json e2e cypress selenium bdd jmeter gatling newman semgrep trivy
```

If `openwiki/.last-update.json` records a `gitHead`, prefer it as the anchor; fall back
to `LAST_WIKI_COMMIT` above. If there are **no** source changes since that commit, stop
and report "wiki already current" — make no edits.

## 2. Build a docs-impact plan

For each changed source area, map: **source change → which wiki page → what edit → why.**
Only pages tied to a real source/behavior change get edited. The page map:

| Source area | Wiki page |
|---|---|
| `lib/backend.ts`, `app/api/**` | `openwiki/api.md` |
| BFF boundary, checkout mechanic, session model, two identities | `openwiki/architecture.md` |
| `app/**` pages, `components/**`, `lib/cart.tsx`, `lib/orders.ts`, testids | `openwiki/frontend.md` |
| `e2e/`, `cypress/`, `selenium/`, `bdd/`, `jmeter/`, `gatling/`, `newman/`, `semgrep/`, `trivy/`, test scripts | `openwiki/testing/overview.md` and/or `openwiki/testing/suites.md` |
| `k8s/`, `Dockerfile`, `.github/`, `.env.example`, `next.config.ts` | `openwiki/operations.md` |
| top-level product/setup/navigation change | `openwiki/quickstart.md` |

## 3. Edit surgically

- Change only pages whose current content is now inaccurate, incomplete, or misleading.
  Prefer replacing one stale sentence over adding paragraphs. Do **not** refresh every
  page. Do **not** make formatting-only edits.
- Keep each concept in one canonical page; update the canonical page and leave the
  link-only mentions alone.
- Keep `file:line` references accurate when you touch a line-anchored claim; if a cited
  line moved, update the anchor.
- Keep `openwiki/quickstart.md`'s section links valid if you add/rename/remove a page.

## 4. Hard boundary — never touch the rules

Do **NOT** edit the behavioral rules in `CLAUDE.md`. The wiki is descriptive only; the
"laws" (honesty posture, testing conventions, the checkout/cookie/BFF rules, branch
rules) live in `CLAUDE.md` and are out of scope for this command. The only CLAUDE.md
change ever allowed here is if the `## OpenWiki` pointer section itself became wrong
(e.g. the wiki entrypoint path changed) — and even then, only that section.

## 5. Record the update

Update `openwiki/.last-update.json` with the new `gitHead` (`git rev-parse HEAD`) and an
ISO-8601 `updatedAt`, then report a short summary: which pages changed and why (source →
page). If nothing changed, say the wiki was already current.

Run `/update-wiki` after significant merges.
