---
name: ux-standards
description: Apply the organization's UX standard while writing a spec, mock, or user-facing copy. This skill should be used when a change adds or alters a screen, form, error message, empty state, or any flow a person sees. Use it during spec and review, not as a visual redesign brief.
---

# UX standards

Replace this example with the design owner's source of truth before treating it as binding.

When you specify or review a user-facing flow:

1. The primary action is one control, labeled with a verb the user already used.
2. Errors stay on the field that failed. Do not clear the form. Do not show a raw stack trace.
3. Empty states say what is missing and the next step; they are not a blank table.
4. Destructive actions need a confirm step that names the object. No silent deletes.

Flag contradictions under **Policy concerns flagged** in `spec.md`. Do not invent a visual
system in the spec — that belongs in a mock the product owner approved.
