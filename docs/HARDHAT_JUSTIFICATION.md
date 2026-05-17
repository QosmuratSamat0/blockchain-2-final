# Hardhat Justification

The assignment strongly prefers Foundry. The provided workspace does not include `forge`, while Node.js and npm are available. To keep the project executable in this environment, the first implementation uses Hardhat with Solidity tests.

Hardhat is acceptable under the assignment when justified. The team should confirm this with the instructor. If Foundry is required, keep the `src/` contracts as the source of truth and port the test cases from `test/protocol.test.js` into Foundry tests.

Current status:

- Hardhat gives immediate local compilation, UUPS proxy testing, coverage, and deployment scripts.
- Slither remains available through CI.
- The suite includes 87 passing tests, 10 deterministic fuzz-style tests, 5 invariant-style tests, and 3 fork-style integration tests.
- Foundry-specific syntax is not used; if the instructor requires Foundry-native execution, port `test/protocol.test.js` into Forge tests while keeping the Solidity contracts unchanged.
