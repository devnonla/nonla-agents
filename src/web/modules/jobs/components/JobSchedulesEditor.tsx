import { AddCircleIcon } from "@solar-icons/react/dynamic/add-circle";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/dynamic/trash-bin-minimalistic";
import { Button } from "antd";
import { useRef } from "react";
import { DEFAULT_JOB_SCHEDULE, type JobSchedule } from "../common/schedule";
import { JobSchedulePicker } from "./JobSchedulePicker";

function newKey() {
  return crypto.randomUUID();
}

export function JobSchedulesEditor({
  value,
  onChange,
}: {
  value: JobSchedule[];
  onChange: (next: JobSchedule[]) => void;
}) {
  const keysRef = useRef<string[]>([]);

  if (keysRef.current.length < value.length) {
    while (keysRef.current.length < value.length) keysRef.current.push(newKey());
  } else if (keysRef.current.length > value.length) {
    keysRef.current = keysRef.current.slice(0, value.length);
  }

  const updateAt = (index: number, next: JobSchedule) => {
    onChange(value.map((s, i) => (i === index ? next : s)));
  };

  const removeAt = (index: number) => {
    keysRef.current = keysRef.current.filter((_, i) => i !== index);
    onChange(value.filter((_, i) => i !== index));
  };

  const addSchedule = () => {
    keysRef.current = [...keysRef.current, newKey()];
    onChange([...value, { ...DEFAULT_JOB_SCHEDULE }]);
  };

  if (value.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
        <p className="m-0 text-sm text-muted-foreground">No schedules — job is off. Add one to run on a cadence.</p>
        <Button size="small" type="dashed" icon={<AddCircleIcon size={14} />} onClick={addSchedule}>
          Add schedule
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((schedule, index) => (
        <div key={keysRef.current[index]} className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Schedule {index + 1}</span>
            <Button type="text" size="small" danger icon={<TrashBinMinimalisticIcon size={14} />} onClick={() => removeAt(index)} aria-label={`Remove schedule ${index + 1}`} />
          </div>
          <JobSchedulePicker value={schedule} onChange={(next) => updateAt(index, next)} />
        </div>
      ))}
      <Button size="small" type="dashed" block icon={<AddCircleIcon size={14} />} onClick={addSchedule}>
        Add schedule
      </Button>
    </div>
  );
}
