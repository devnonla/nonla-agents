# @nonla-agents/ui (NonlaUI)

Ant Design–like React controls for Nonla Agents. Workspace package — **npm publish later**.

## Use from web

```tsx
import "@nonla-agents/ui/styles.css";
import { App, Button, EFormItemType, Form, Modal, message, type TFormItemProps } from "@nonla-agents/ui";
import { useForm } from "react-hook-form";

message.success("Saved");
Modal.confirm({ title: "Delete?", onOk: async () => {} });

const items: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    rules: { required: "Name is required" },
    options: { placeholder: "Your name" },
  },
];

function Example() {
  const form = useForm({ defaultValues: { name: "" } });
  return (
    <App>
      <form onSubmit={form.handleSubmit(console.log)}>
        <Form form={form} items={items} />
        <Button type="primary" htmlType="submit">
          Save
        </Button>
      </form>
    </App>
  );
}
```

`Form` is JSON-schema driven (ZoForm-style) on `react-hook-form`. The BE can return `TFormItemProps[]`; FE hydrates `rules.pattern` strings to `RegExp`. Pass `fetcher` for `select_remote` fields.

# Sizes

Only **3 canonical sizes**: `small` | `default` | `large`.

Edit [`src/lib/sizes.ts`](src/lib/sizes.ts) — `CONTROL_SIZES`.

Aliases: `xs` → small, `middle` / `medium` → default.

# Theme (colors)

All color lives in **`--nonla-*` knobs** (`src/styles.css`). Components never hardcode palette hex.

**Other apps** — import the CSS, then override knobs. Do not fork Button/Tag/….

```css
@import "tailwindcss";
@import "@nonla-agents/ui/styles.css";

:root {
  --nonla-brand: #3b82f6;
  --nonla-bg: #0b0f19;
}
```

`--nonla-brand-soft` follows brand (`color-mix(in oklab, var(--nonla-brand) 72%, white)`). Override it only if you need a one-off.

Or at runtime:

```tsx
<App
  theme={{
    colors: { brand: "#3b82f6", bg: "#0b0f19", border: "#666666", borderInput: "#8a8a8a" },
  }}
>
  …
</App>
```

Flat knobs still work (`brand`, `colorBorder`, `colorBorderInput`, …). `applyNonlaTheme({ brand: "#3b82f6" })` does the same on `:root`.

Core knobs: `--nonla-bg`, `--nonla-fg`, `--nonla-brand`, `--nonla-danger`, `--nonla-success`, `--nonla-warn`, `--nonla-link`, `--nonla-radius` (small = −2px, large = +2px), `--nonla-height` / `--nonla-height-sm` / `--nonla-height-lg`, plus surfaces (`--nonla-surface`, `--nonla-chip`, …) and preset accents (`--nonla-blue`, `--nonla-purple`, …).

Those map into shadcn-standard tokens (`--background`, `--destructive`, …) plus Nonla aliases (`--brand`, `--success`, …).

- You: only touch `--nonla-*` (CSS or `theme` / `applyNonlaTheme`).
- Shadcn consumers: can still override `--background` / `--primary` / etc.
- Nonla CTA = `--brand` (from `--nonla-brand`). `--primary` = light ink (app DESIGN), not the amber button.
