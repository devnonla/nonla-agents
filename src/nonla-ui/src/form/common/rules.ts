import type { RegisterOptions } from "react-hook-form";
import type { TFormRule, TRuleValueMessage } from "./types";

function asValueMessage(raw: number | TRuleValueMessage | undefined): TRuleValueMessage | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return { value: raw };
  return raw;
}

function compilePattern(value: string | RegExp, message?: string): { value: RegExp; message?: string } | undefined {
  if (value instanceof RegExp) {
    return { value, message };
  }
  try {
    return { value: new RegExp(value), message };
  } catch (err) {
    console.error("[nonla-ui Form] Invalid pattern regex:", value, err);
    return undefined;
  }
}

/**
 * Hydrate JSON-serializable `TFormRule` into RHF `RegisterOptions`.
 * Converts string `pattern.value` → `RegExp`.
 */
export function hydrateRules(rules?: TFormRule): RegisterOptions | undefined {
  if (!rules) return undefined;

  const out: RegisterOptions = {};

  if (rules.required != null) {
    out.required = rules.required;
  }

  const min = asValueMessage(rules.min);
  if (min) out.min = min.message != null ? { value: min.value, message: min.message } : min.value;

  const max = asValueMessage(rules.max);
  if (max) out.max = max.message != null ? { value: max.value, message: max.message } : max.value;

  const minLength = asValueMessage(rules.minLength);
  if (minLength) out.minLength = minLength.message != null ? { value: minLength.value, message: minLength.message } : minLength.value;

  const maxLength = asValueMessage(rules.maxLength);
  if (maxLength) out.maxLength = maxLength.message != null ? { value: maxLength.value, message: maxLength.message } : maxLength.value;

  if (rules.pattern) {
    const compiled = compilePattern(rules.pattern.value, rules.pattern.message);
    if (compiled) {
      out.pattern = compiled.message != null ? { value: compiled.value, message: compiled.message } : compiled.value;
    }
  }

  if (rules.validate) {
    out.validate = rules.validate as RegisterOptions["validate"];
  }

  return out;
}

export function fieldNameOf(name: string | string[] | number[]): string {
  return Array.isArray(name) ? name.join(".") : String(name);
}

export function isRuleRequired(rules?: TFormRule): boolean {
  if (rules?.required == null || rules.required === false) return false;
  return true;
}
