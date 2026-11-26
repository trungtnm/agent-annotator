# Security policy

## Supported versions

Only the latest release gets security fixes. Upgrade to it before reporting.

| Version | Supported |
|---|---|
| 0.5.x | Yes |
| < 0.5 | No |

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/trungtnm/agent-annotator/security/advisories/new)
(**Security → Report a vulnerability**).

Include the version, your framework and browser, the steps to reproduce, and what an attacker
gains. You will get an answer in the advisory thread. A confirmed issue is fixed in a new
release, and the advisory is published after that release, crediting you unless you ask not to be.

## Scope

The package is a development-only overlay. It runs in the developer's browser, on the dev
server's page, and is meant to be left out of production builds (see the README).

These are in scope:

- Personal data getting past redaction into a copied prompt or screenshot when redaction is on.
- Page content (element text, props, state, console messages) running as code in the overlay,
  or breaking out of its place in the Markdown prompt in a way that changes the instructions
  an agent reads.
- Requests the overlay sends anywhere other than the ones listed below.
- The package ending up in a production bundle when mounted as the README shows.

What the overlay does by design, which is not a vulnerability on its own:

- It sends requests only to the dev server's `/__nextjs_original-stack-frames` endpoint, and
  for the scripts and source maps that the page itself loaded, to map stack frames to source
  lines.
- It keeps comments in `sessionStorage` and preferences in `localStorage`, writes prompts and
  screenshots to the clipboard, and captures the tab only after the browser asks you.
- It shows props, state and source paths, which is the information a developer already has in
  their own dev environment.
