import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // These rules come from the React Compiler checks. The app does not use the
    // compiler, and the existing code that trips them (render-time ref reads in
    // the selection bar, setState in effects) works as written. They stay
    // visible as warnings so they can be cleaned up over time.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"] },
];

export default config;
