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

Edit **few knobs** in [`src/styles.css`](src/styles.css):

```css
--nonla-bg: #121212;
--nonla-fg: #d4d4d4;
--nonla-brand: #dd7627;
--nonla-danger: #ef4444;
--nonla-success: #0ac864;
--nonla-warn: #f1b467;
--nonla-link: #599ce7;
--nonla-radius: 8px;
```

Those map into **shadcn-standard** tokens (`--background`, `--primary`, `--destructive`, …) plus Nonla aliases (`--brand`, `--success`, …).

- You: only touch `--nonla-*`.
- Shadcn consumers: can still override `--background` / `--primary` / etc.
- Nonla CTA = `--brand` (from `--nonla-brand`). `--primary` = light ink (app DESIGN), not the amber button.
