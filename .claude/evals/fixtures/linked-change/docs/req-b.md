# Requirement B — family sort key

Invoice search cannot sort "mary-jane watson-smith" by family name. The family name is
the last hyphen-separated word part of the last space-separated word, capitalised the
same way `titlecase()` capitalises a word part: `watson-smith` → `Smith`.

Add `family_sort_key()` for that. This continues `hyphen-titlecase`: reuse its word-part
rule. Do not change `titlecase()` or `src/app/text.py`. Put the new function in a new
module. Owner: billing.

You have everything you need.
