import { Input, Select, Switch } from "antd";
import type { DatatableColumn } from "src/common/types";
import { DATETIME_PICKER_FORMAT, fromPickerDate, toPickerDate } from "src/common/utils/date";
import DatePicker from "src/components/DatePicker";
import { NumberStepper } from "./NumberStepper";

export function cellEditor(col: DatatableColumn, value: unknown, onChange: (v: unknown) => void, timeZone: string) {
  switch (col.type) {
    case "number":
      return <NumberStepper value={value} onChange={(v) => onChange(v)} className="w-full shadow-none!" />;
    case "boolean":
      return <Switch checked={Boolean(value)} onChange={(v) => onChange(v)} />;
    case "datetime":
      return <DatePicker showTime allowClear needConfirm changeOnBlur={false} previewValue={false} className="w-full" format={DATETIME_PICKER_FORMAT} value={toPickerDate(typeof value === "string" ? value : null, timeZone)} onChange={(d) => onChange(fromPickerDate(d, timeZone))} />;
    case "select":
      return <Select className="w-full" allowClear value={typeof value === "string" ? value : undefined} onChange={(v) => onChange(v ?? null)} options={(col.options ?? []).map((o) => ({ value: o, label: o }))} />;
    case "json":
      return (
        <Input.TextArea
          rows={2}
          autoSize={{ minRows: 2, maxRows: 6 }}
          value={value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          placeholder="{}"
          onChange={(e) => {
            const text = e.target.value;
            if (text.trim() === "") {
              onChange(null);
              return;
            }
            try {
              onChange(JSON.parse(text));
            } catch {
              onChange(text);
            }
          }}
        />
      );
    default:
      return <Input value={typeof value === "string" ? value : value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}
