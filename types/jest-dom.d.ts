// jest.setup.js imports "@testing-library/jest-dom" at runtime, which is what
// makes matchers like toBeInTheDocument work. TypeScript does not see that,
// because a side-effect import in a .js setup file contributes no types to the
// program — so every use of those matchers was a type error even though the
// tests themselves pass.
import "@testing-library/jest-dom";
