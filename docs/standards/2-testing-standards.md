# Testing Standards

All principles in this document are based on Vladimir Khorikov's *Unit Testing: Principles, Practices, and Patterns*. For each principle, the value it protects (regression protection / refactoring resistance / fast feedback) is noted explicitly.

## Background: What makes a test valuable

Test value ≈ `regression protection × refactoring resistance × fast feedback` (multiplicative).

- **Regression protection**: ability to catch bugs. Proportional to amount of code exercised, complexity, and domain importance.
- **Refactoring resistance**: ability to survive behavior-preserving refactorings without false positives. Drops to zero as the test couples to implementation details.
- **Fast feedback**: how quickly the test runs. Faster = run more often = catch regressions sooner.

Because it's multiplicative, any value near zero collapses the whole product. **Tests coupled to implementation details have near-zero refactoring resistance and therefore near-zero total value** — every principle below ultimately reduces to "test only observable behavior."

---

## Principles

### Principle 1: Treat the SUT as a black box

**Test only observable behavior.**

- Allowed: inputs/outputs, externally observable state changes, calls going out to unmanaged dependencies
- Forbidden: calling private methods directly, asserting on internal collaborators, asserting on internal data structures, asserting on call order/count

> If a behavior-preserving refactoring breaks the test, this principle was violated. (Refactoring resistance ↓)

### Principle 2: Use real instances for managed dependencies

**For dependencies we control (own DB, own cache), use a real instance (e.g., testcontainers). Do not replace them with mocks or fake repositories.**

- Verify results by reading from the real instance in the same test
- Fake repositories are just another form of mocking and will drift from real DB behavior — forbidden

> Do not justify fake DBs with "fast feedback." Fast feedback comes from **shrinking the surface that needs a DB**, not from faking the DB (see Principle 8). (Regression protection ↓ if violated)

### Principle 3: Mock only unmanaged dependencies, at the edge

**Mock only systems whose effects you cannot observe from inside the test — SMTP, payment gateways, external LLM APIs, message buses consumed by other services.**

- For these, `assert_called_with` is the legitimate way to verify the outbound contract
- Decision rule: "Can I observe the result through any other means?" → if yes, treat as managed and use the real thing

> You cannot actually receive the email in a test, so verifying "an email was sent with X" via call assertion is the only honest option. This is the only case where call assertions are allowed.

### Principle 4: Never assert on stubs

**Stubs (test doubles that answer incoming queries) must not have call assertions (`assert_called`, `call_count`, etc.) attached.**

- Call assertions belong only on mocks for outbound commands to unmanaged dependencies

> Asserting on a stub couples the test to *how* the SUT used the dependency rather than *what result* it produced. (Refactoring resistance ↓)

### Principle 5: Name tests by behavior, not by method

**Use `test_<situation>_<expected_outcome>` form.**

- Good: `test_returns_empty_list_when_no_matches`, `test_raises_when_document_is_password_protected`
- Bad: `test_calls_filter_method`, `test_process_document`, `test__is_source_metadata_reflected`

> When test names mirror method names, test structure mirrors implementation structure and breaks alongside refactoring. (Refactoring resistance ↓)

### Principle 6: Do not reimplement SUT logic in the test

**Do not compute expected values with `expected = some_logic(input)` patterns.**

- Hardcode expected values, or compute them with logic completely independent of the SUT

> If the test computes expected values with the same logic as the SUT, identical bugs land on both sides and the assertion is meaningless. (Regression protection ↓)

### Principle 7: Group tests by behavior, not by method

**Write one test per observable behavior, not one test per method.**

- A refactoring that extracts/merges/moves methods must not break tests if behavior is unchanged

> 1:1 method-to-test mirroring breaks under any structural change. Group tests around the behavior the user/caller cares about. (Refactoring resistance ↓)

### Principle 8: Humble Object — separate domain logic from infrastructure

**Keep business rules as pure functions/objects with no external I/O. Isolate DB, HTTP, sentry, file I/O, etc., into thin adapters.**

- The vast majority of tests target pure domain logic as fast unit tests
- A small number of integration tests cover the thin adapters with real instances

> Fast feedback is not achieved by faking dependencies; it's achieved by **shrinking the area that depends on infrastructure in the first place**. New code should be written this way from the start.

### Principle 9: Refactor first, then test legacy entangled code

**When domain logic and infrastructure are entangled in a single method, do not bolt mock-heavy unit tests on top. Instead:**

1. **Extract** the domain rule you want to test (e.g., "metadata reflection check," "needs-download decision," "placeholder detection") into a pure function/method.
2. **Unit test** the extracted pure piece.
3. If the remaining thin orchestration is non-trivial, cover it with a real-instance integration test. If it's trivial, leaving it untested with an explicit note is acceptable.

**Forbidden:**

- Routing around the difficulty of refactoring by mocking internal collaborators, testing private methods directly, or asserting on internal call patterns. Such tests have zero refactoring resistance, will be deleted during the eventual cleanup, and carry **negative value** in the meantime (false confidence + active obstacle to refactoring).

> Test addition and refactoring belong in the same PR. The mindset of "we'll fix the tests when we refactor later" is exactly what blocks the refactoring from ever happening.

---

## Anti-pattern summary

| Pattern | Value damaged | Alternative |
|---------|---------------|-------------|
| Direct private-method tests | Refactoring resistance | Reach via public API; if unreachable, extract (Principle 9) |
| Mocking internal collaborators | Refactoring resistance | Extract domain logic to pure functions, unit test those |
| Fake repositories | Regression protection | Real DB (testcontainers) + Humble Object |
| `assert_called_with` on stubs | Refactoring resistance | Stubs respond only; assertions belong on mocks |
| Asserting call order/count | Refactoring resistance | Assert on results (return values, DB state) |
| 1:1 method-to-test mirroring | Refactoring resistance | Group by behavior |
| Reimplementing SUT logic in test | Regression protection | Hardcode expected values |
| Mock-hell setup blocks | Fast feedback + refactoring resistance | Apply Humble Object to reduce dependencies |

---

## Self-check (after writing a test)

1. Would a behavior-preserving refactoring (rename, extract/merge method, swap a collaborator) break this test? If yes → Principle 1 violated.
2. Is everything mocked an unmanaged dependency? Did I avoid mocking the own DB or internal collaborators? → Principles 2, 3.
3. Did I avoid `assert_called_with` on stubs? → Principle 4.
4. Does the test name describe a behavior, not a method? → Principle 5.
5. Did I avoid computing expected values with the SUT's own logic? → Principle 6.
6. Did I need to mock infrastructure to test a domain rule? If yes → apply Principle 8/9 (extract first).
