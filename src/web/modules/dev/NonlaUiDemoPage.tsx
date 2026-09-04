import {
  Button,
  ChatAgentMessage,
  ChatError,
  ChatInput,
  ChatThinking,
  ChatToolCall,
  ChatUserMessage,
  ChatWelcome,
  Checkbox,
  CodeBlock,
  DatePicker,
  Drawer,
  Dropdown,
  EFormItemType,
  Empty,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Popover,
  SchemaForm,
  Segmented,
  Select,
  Skeleton,
  Spin,
  Switch,
  type TFormItemProps,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  message,
} from "@nonla-agents/ui";
import { AddIcon } from "@solar-icons/react/dynamic/add";
import { AltArrowDownIcon } from "@solar-icons/react/dynamic/alt-arrow-down";
import { AltArrowLeftIcon } from "@solar-icons/react/dynamic/alt-arrow-left";
import { BellIcon } from "@solar-icons/react/dynamic/bell";
import { BotIcon } from "@solar-icons/react/dynamic/bot";
import { BoxMinimalisticIcon } from "@solar-icons/react/dynamic/box-minimalistic";
import { CalendarIcon } from "@solar-icons/react/dynamic/calendar";
import { ChatRoundIcon } from "@solar-icons/react/dynamic/chat-round";
import { ChatRoundDotsIcon } from "@solar-icons/react/dynamic/chat-round-dots";
import { CheckSquareIcon } from "@solar-icons/react/dynamic/check-square";
import { ClipboardListIcon } from "@solar-icons/react/dynamic/clipboard-list";
import { ClockCircleIcon } from "@solar-icons/react/dynamic/clock-circle";
import { CodeSquareIcon } from "@solar-icons/react/dynamic/code-square";
import { CursorSquareIcon } from "@solar-icons/react/dynamic/cursor-square";
import { DialogIcon } from "@solar-icons/react/dynamic/dialog";
import { DocumentTextIcon } from "@solar-icons/react/dynamic/document-text";
import { HamburgerMenuIcon } from "@solar-icons/react/dynamic/hamburger-menu";
import { HandShakeIcon } from "@solar-icons/react/dynamic/hand-shake";
import { HashtagIcon } from "@solar-icons/react/dynamic/hashtag";
import { InfoCircleIcon } from "@solar-icons/react/dynamic/info-circle";
import { LayersMinimalisticIcon } from "@solar-icons/react/dynamic/layers-minimalistic";
import { LightbulbIcon } from "@solar-icons/react/dynamic/lightbulb";
import { MagnifierIcon } from "@solar-icons/react/dynamic/magnifier";
import { MenuDotsIcon } from "@solar-icons/react/dynamic/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/react/dynamic/pen-new-square";
import { ProgrammingIcon } from "@solar-icons/react/dynamic/programming";
import { QuestionCircleIcon } from "@solar-icons/react/dynamic/question-circle";
import { RefreshIcon } from "@solar-icons/react/dynamic/refresh";
import { SidebarMinimalisticIcon } from "@solar-icons/react/dynamic/sidebar-minimalistic";
import { SliderHorizontalIcon } from "@solar-icons/react/dynamic/slider-horizontal";
import { TagIcon } from "@solar-icons/react/dynamic/tag";
import { TextFieldIcon } from "@solar-icons/react/dynamic/text-field";
import { TransferHorizontalIcon } from "@solar-icons/react/dynamic/transfer-horizontal";
import { TrashBinTrashIcon } from "@solar-icons/react/dynamic/trash-bin-trash";
import { UserIcon } from "@solar-icons/react/dynamic/user";
import { Widget2Icon } from "@solar-icons/react/dynamic/widget-2";
import { type Key, type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

type DemoId =
  | "button"
  | "input"
  | "input-number"
  | "select"
  | "datepicker"
  | "timepicker"
  | "switch"
  | "checkbox"
  | "form"
  | "tag"
  | "table"
  | "empty"
  | "segmented"
  | "skeleton"
  | "tooltip"
  | "popover"
  | "codeblock"
  | "message"
  | "modal"
  | "drawer"
  | "popconfirm"
  | "spin"
  | "dropdown"
  | "pagination"
  | "chat-conversation"
  | "chat-welcome"
  | "chat-user"
  | "chat-agent"
  | "chat-thinking"
  | "chat-tool"
  | "chat-input";

const ICON = { size: 16, weight: "BoldDuotone" as const }; // match AppSidebar

type NavItem = { id: DemoId; label: string; icon: ReactNode };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "General",
    items: [{ id: "button", label: "Button", icon: <CursorSquareIcon {...ICON} /> }],
  },
  {
    title: "Data Entry",
    items: [
      { id: "input", label: "Input", icon: <TextFieldIcon {...ICON} /> },
      { id: "input-number", label: "InputNumber", icon: <HashtagIcon {...ICON} /> },
      { id: "select", label: "Select", icon: <AltArrowDownIcon {...ICON} /> },
      { id: "datepicker", label: "DatePicker", icon: <CalendarIcon {...ICON} /> },
      { id: "timepicker", label: "TimePicker", icon: <ClockCircleIcon {...ICON} /> },
      { id: "switch", label: "Switch", icon: <TransferHorizontalIcon {...ICON} /> },
      { id: "checkbox", label: "Checkbox", icon: <CheckSquareIcon {...ICON} /> },
      { id: "form", label: "Form", icon: <DocumentTextIcon {...ICON} /> },
    ],
  },
  {
    title: "Data Display",
    items: [
      { id: "tag", label: "Tag", icon: <TagIcon {...ICON} /> },
      { id: "table", label: "Table", icon: <ClipboardListIcon {...ICON} /> },
      { id: "empty", label: "Empty", icon: <BoxMinimalisticIcon {...ICON} /> },
      { id: "segmented", label: "Segmented", icon: <SliderHorizontalIcon {...ICON} /> },
      { id: "skeleton", label: "Skeleton", icon: <LayersMinimalisticIcon {...ICON} /> },
      { id: "tooltip", label: "Tooltip", icon: <InfoCircleIcon {...ICON} /> },
      { id: "popover", label: "Popover", icon: <ChatRoundDotsIcon {...ICON} /> },
      { id: "codeblock", label: "CodeBlock", icon: <CodeSquareIcon {...ICON} /> },
    ],
  },
  {
    title: "Feedback",
    items: [
      { id: "message", label: "Message", icon: <BellIcon {...ICON} /> },
      { id: "modal", label: "Modal", icon: <DialogIcon {...ICON} /> },
      { id: "drawer", label: "Drawer", icon: <SidebarMinimalisticIcon {...ICON} /> },
      { id: "popconfirm", label: "Popconfirm", icon: <QuestionCircleIcon {...ICON} /> },
      { id: "spin", label: "Spin", icon: <RefreshIcon {...ICON} /> },
    ],
  },
  {
    title: "Navigation",
    items: [
      { id: "dropdown", label: "Dropdown", icon: <MenuDotsIcon {...ICON} /> },
      { id: "pagination", label: "Pagination", icon: <Widget2Icon {...ICON} /> },
    ],
  },
];

/** Second-level panel — mirrors AppSidebar Settings drill-in. */
const CHAT_NAV: NavItem[] = [
  { id: "chat-conversation", label: "Conversation", icon: <ChatRoundIcon {...ICON} /> },
  { id: "chat-welcome", label: "Welcome", icon: <HandShakeIcon {...ICON} /> },
  { id: "chat-user", label: "User message", icon: <UserIcon {...ICON} /> },
  { id: "chat-agent", label: "Agent message", icon: <BotIcon {...ICON} /> },
  { id: "chat-thinking", label: "Thinking", icon: <LightbulbIcon {...ICON} /> },
  { id: "chat-tool", label: "Tool call", icon: <ProgrammingIcon {...ICON} /> },
  { id: "chat-input", label: "Input", icon: <PenNewSquareIcon {...ICON} /> },
];

const ALL_IDS = [...NAV.flatMap((g) => g.items.map((i) => i.id)), ...CHAT_NAV.map((i) => i.id)];

function isChatDemo(id: DemoId) {
  return id.startsWith("chat-");
}

function readHash(): DemoId {
  const raw = window.location.hash.replace(/^#/, "");
  return ALL_IDS.includes(raw as DemoId) ? (raw as DemoId) : "button";
}

function DemoBlock({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-5">
      {title ? <div className="mb-4 text-sm text-muted-foreground">{title}</div> : null}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 flex flex-col gap-2 border-b border-border pb-5">
      <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
      <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{description}</p>
    </header>
  );
}

function ButtonDemo() {
  return (
    <>
      <PageHeader title="Button" description="To trigger an operation." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Type">
          <div className="flex flex-wrap gap-2">
            <Button type="primary">Primary</Button>
            <Button type="default">Default</Button>
            <Button type="dashed">Dashed</Button>
            <Button type="text">Text</Button>
            <Button type="link">Link</Button>
          </div>
        </DemoBlock>
        <DemoBlock title="Size">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="primary" size="small">
              Small
            </Button>
            <Button type="primary" size="default">
              Default
            </Button>
            <Button type="primary" size="large">
              Large
            </Button>
          </div>
        </DemoBlock>
        <DemoBlock title="Icon">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="primary" icon={<AddIcon size={16} />}>
              With icon
            </Button>
            <Button type="default" icon={<MagnifierIcon size={16} />} iconPlacement="end">
              Icon end
            </Button>
            <Button type="primary" icon={<PenNewSquareIcon size={16} />} />
            <Button type="default" icon={<MagnifierIcon size={16} />} />
            <Button type="text" icon={<PenNewSquareIcon size={16} />} />
            <Button type="primary" danger icon={<TrashBinTrashIcon size={16} />} />
            <Button type="primary" shape="circle" icon={<AddIcon size={16} />} />
            <Button type="default" shape="round" icon={<MagnifierIcon size={16} />}>
              Round
            </Button>
            <Button type="primary" loading icon={<AddIcon size={16} />} />
          </div>
        </DemoBlock>
        <DemoBlock title="Danger / Loading">
          <div className="flex flex-wrap gap-2">
            <Button type="primary" danger>
              Danger
            </Button>
            <Button type="primary" loading>
              Loading
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </DemoBlock>
      </div>
    </>
  );
}

function InputDemo() {
  return (
    <>
      <PageHeader title="Input" description="A basic widget for getting the user input." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Size">
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <Input size="small" placeholder="Small" />
            <Input placeholder="Default" />
            <Input size="large" placeholder="Large" />
          </div>
        </DemoBlock>
        <DemoBlock title="Status">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Input status="error" placeholder="Error" defaultValue="Invalid" />
            <Input status="warning" placeholder="Warning" defaultValue="Check this" />
          </div>
        </DemoBlock>
        <DemoBlock title="Prefix / Suffix / Clear">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Input prefix={<MagnifierIcon size={14} />} placeholder="With prefix" />
            <Input suffix={<AddIcon size={14} />} placeholder="With suffix" allowClear defaultValue="Clearable" />
          </div>
        </DemoBlock>
        <DemoBlock title="Variants">
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <Input.Password placeholder="Password" />
            <Input.Password placeholder="No toggle" visibilityToggle={false} />
            <Input variant="filled" placeholder="Filled" />
            <Input variant="borderless" placeholder="Borderless" />
          </div>
          <Input disabled placeholder="Disabled" defaultValue="Can't edit" className="max-w-xl" />
        </DemoBlock>
        <DemoBlock title="TextArea">
          <Input.TextArea placeholder="Multi-line notes…" rows={3} className="max-w-xl" />
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Auto-grow (min 2, max 6)" className="max-w-xl" />
          <Input.TextArea status="error" placeholder="Error" rows={2} className="max-w-xl" />
        </DemoBlock>
      </div>
    </>
  );
}

function InputNumberDemo() {
  return (
    <>
      <PageHeader title="InputNumber" description="Enter a number within certain range with the mouse or keyboard." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic">
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <InputNumber min={0} max={100} step={5} defaultValue={25} />
            <InputNumber min={0} max={10} step={0.1} precision={1} defaultValue={1.5} />
            <InputNumber controls={false} defaultValue={42} placeholder="No steppers" />
          </div>
        </DemoBlock>
        <DemoBlock title="Disabled">
          <InputNumber disabled defaultValue={7} className="max-w-xs" />
        </DemoBlock>
      </div>
    </>
  );
}

function SelectDemo() {
  const roles = [
    { label: "Admin", value: "admin" },
    { label: "Editor", value: "editor" },
    { label: "Viewer", value: "viewer" },
    { label: "Guest (disabled)", value: "guest", disabled: true },
  ];
  return (
    <>
      <PageHeader title="Select" description="Select component to select a value from options." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Select placeholder="Pick a role" options={roles} />
            <Select defaultValue="admin" options={roles.filter((o) => !o.disabled)} />
          </div>
        </DemoBlock>
        <DemoBlock title="Status">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Select
              status="error"
              placeholder="Error"
              options={[
                { label: "A", value: "a" },
                { label: "B", value: "b" },
              ]}
            />
            <Select disabled placeholder="Disabled" options={[{ label: "X", value: "x" }]} />
          </div>
        </DemoBlock>
        <DemoBlock title="Search / clear / numbers">
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Select
              showSearch={{ optionFilterProp: "label" }}
              allowClear
              placeholder="Search timezone…"
              options={[
                { label: "Asia/Ho_Chi_Minh", value: "Asia/Ho_Chi_Minh" },
                { label: "America/New_York", value: "America/New_York" },
                { label: "Europe/London", value: "Europe/London" },
                { label: "UTC", value: "UTC" },
              ]}
            />
            <Select allowClear placeholder="Hour" options={Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, "0") }))} />
          </div>
        </DemoBlock>
      </div>
    </>
  );
}

function DatePickerDemo() {
  return (
    <>
      <PageHeader title="DatePicker" description="Popover + calendar — pick a date, time, or date range." />
      <DemoBlock title="Basic">
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <DatePicker placeholder="Pick a date" />
          <DatePicker showTime placeholder="Pick date & time" />
          <DatePicker status="error" placeholder="Error" />
          <DatePicker disabled placeholder="Disabled" />
        </div>
      </DemoBlock>
      <DemoBlock title="Range">
        <div className="max-w-xl">
          <DatePicker.RangePicker />
        </div>
      </DemoBlock>
      <DemoBlock title="Confirm">
        <DatePicker showTime needConfirm placeholder="Date & time — OK to apply" className="max-w-xs" />
      </DemoBlock>
    </>
  );
}

function TimePickerDemo() {
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("18:00");

  return (
    <>
      <PageHeader title="TimePicker" description="Make-style stepper — arrows, or click hour/minute to open a grid." />
      <DemoBlock title="Schedule">
        <div className="grid max-w-xs gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">Time from</span>
            <TimePicker value={from} onChange={(t) => setFrom(t ?? "")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground">Time to</span>
            <TimePicker value={to} onChange={(t) => setTo(t ?? "")} />
          </div>
        </div>
      </DemoBlock>
      <DemoBlock title="Basic">
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <TimePicker placeholder="Select time" />
          <TimePicker use12Hours placeholder="12-hour" />
          <TimePicker format="HH:mm:ss" placeholder="With seconds" />
          <TimePicker minuteStep={5} placeholder="5-minute steps" />
          <TimePicker status="error" placeholder="Error" />
          <TimePicker disabled placeholder="Disabled" />
        </div>
      </DemoBlock>
      <DemoBlock title="Size">
        <div className="flex max-w-md flex-col gap-3">
          <TimePicker size="small" defaultValue="08:00" />
          <TimePicker size="default" defaultValue="08:00" />
          <TimePicker size="large" defaultValue="08:00" />
        </div>
      </DemoBlock>
    </>
  );
}

function SwitchDemo() {
  return (
    <>
      <PageHeader title="Switch" description="Switching Selector." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Default">
          <div className="flex flex-wrap items-center gap-4">
            <Switch defaultChecked />
            <Switch />
            <Switch disabled />
            <Switch disabled checked />
          </div>
        </DemoBlock>
        <DemoBlock title="Square">
          <div className="flex flex-wrap items-center gap-4">
            <Switch variant="square" defaultChecked />
            <Switch variant="square" />
            <Switch variant="square" disabled />
            <Switch variant="square" disabled checked />
          </div>
        </DemoBlock>
        <DemoBlock title="Sizes">
          <div className="flex flex-col gap-3">
            {(["small", "default", "large"] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-3">
                <span className="w-16 text-xs text-muted-foreground">{size}</span>
                <Switch size={size} defaultChecked />
                <Switch size={size} variant="square" defaultChecked />
                <Button size={size} type="primary">
                  Button
                </Button>
                <Input size={size} placeholder="Input" className="w-40" />
              </div>
            ))}
          </div>
        </DemoBlock>
      </div>
    </>
  );
}

function CheckboxDemo() {
  return (
    <>
      <PageHeader title="Checkbox" description="Collect user's choices." />
      <DemoBlock>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox defaultChecked>Checked</Checkbox>
          <Checkbox>Unchecked</Checkbox>
          <Checkbox indeterminate>Indeterminate</Checkbox>
          <Checkbox disabled>Disabled</Checkbox>
          <Checkbox disabled checked>
            Disabled on
          </Checkbox>
        </div>
      </DemoBlock>
    </>
  );
}

/** JSON-serializable schema — same shape a BE endpoint can return. */
const FORM_DEMO_ITEMS: TFormItemProps[] = [
  {
    type: EFormItemType.Input,
    name: "name",
    label: "Name",
    colSpan: 12,
    rules: { required: "Name is required", minLength: { value: 2, message: "Min 2 chars" } },
    options: { placeholder: "Your name", allowClear: true },
  },
  {
    type: EFormItemType.Input,
    name: "email",
    label: "Email",
    colSpan: 12,
    rules: {
      required: "Email is required",
      pattern: { value: "^.+@.+\\..+$", message: "Invalid email" },
    },
    options: { placeholder: "you@example.com" },
  },
  {
    type: EFormItemType.Textarea,
    name: "bio",
    label: "Bio",
    colSpan: 12,
    options: { placeholder: "Short bio", rows: 3 },
  },
  {
    type: EFormItemType.Number,
    name: "count",
    label: "Count",
    colSpan: 6,
    options: { min: 0, max: 99 },
  },
  {
    type: EFormItemType.Select,
    name: "role",
    label: "Role",
    colSpan: 6,
    choices: [
      { label: "Admin", value: "admin" },
      { label: "User", value: "user" },
      { label: "Guest", value: "guest" },
    ],
  },
  {
    type: EFormItemType.SelectRemote,
    name: "teamId",
    label: "Team (remote)",
    colSpan: 12,
    endpoint: "/mock/teams",
    keyProp: "id",
    labelProp: "name",
    dataProp: "items",
  },
  {
    type: EFormItemType.DateTime,
    name: "when",
    label: "Start date",
    colSpan: 6,
  },
  {
    type: EFormItemType.Time,
    name: "at",
    label: "Start time",
    colSpan: 6,
  },
  {
    type: EFormItemType.Radio,
    name: "plan",
    label: "Plan",
    colSpan: 12,
    choices: [
      { label: "Free", value: "free" },
      { label: "Pro", value: "pro" },
    ],
  },
  {
    type: EFormItemType.Color,
    name: "accent",
    label: "Accent",
    colSpan: 6,
  },
  {
    type: EFormItemType.Switch,
    name: "on",
    label: "Notifications",
    colSpan: 6,
  },
  {
    type: EFormItemType.SelectMultiple,
    name: "tags",
    label: "Tags",
    colSpan: 12,
    choices: [
      { label: "Alpha", value: "alpha" },
      { label: "Beta", value: "beta" },
      { label: "Gamma", value: "gamma" },
    ],
    conditions: [[["role", "==", "admin"]]],
    helps: [{ text: "Only visible when Role is Admin" }],
  },
  {
    type: EFormItemType.Object,
    name: "address",
    label: "Address",
    colSpan: 12,
    collapsable: true,
    childItems: [
      { type: EFormItemType.Input, name: "city", label: "City", colSpan: 6, options: { placeholder: "City" } },
      { type: EFormItemType.Input, name: "zip", label: "ZIP", colSpan: 6, options: { placeholder: "ZIP" } },
    ],
  },
  {
    type: EFormItemType.Repeater,
    name: "contacts",
    label: "Contacts",
    colSpan: 12,
    childItems: [
      { type: EFormItemType.Input, name: "label", label: "Label", colSpan: 6, defaultValue: "" },
      { type: EFormItemType.Input, name: "phone", label: "Phone", colSpan: 6, defaultValue: "" },
    ],
  },
  {
    type: EFormItemType.Checkbox,
    name: "agree",
    label: "Agreement",
    colSpan: 12,
    rules: {
      required: "You must agree",
      validate: (value) => (value ? true : "You must agree"),
    },
    options: { checkboxLabel: "I agree to the terms" },
  },
  { type: EFormItemType.Hidden, name: "source", defaultValue: "demo" },
];

function FormDemo() {
  const form = useForm<Record<string, unknown>>({
    defaultValues: {
      name: "",
      email: "",
      bio: "",
      count: 1,
      role: "admin",
      teamId: null,
      plan: "free",
      accent: "#dd7627",
      on: true,
      tags: ["alpha"],
      address: { city: "", zip: "" },
      contacts: [{ label: "Work", phone: "" }],
      agree: false,
      source: "demo",
    },
    mode: "onSubmit",
  });

  const mockFetcher = async (endpoint: string) => {
    await new Promise((r) => setTimeout(r, 400));
    if (endpoint === "/mock/teams") {
      return {
        items: [
          { id: "t1", name: "Platform" },
          { id: "t2", name: "Growth" },
          { id: "t3", name: "Support" },
        ],
      };
    }
    return [];
  };

  return (
    <>
      <PageHeader title="Form" description="JSON-driven form (react-hook-form). Schema can come from the BE." />
      <DemoBlock>
        <form
          className="max-w-xl flex flex-col gap-4"
          onSubmit={form.handleSubmit(
            (values) => message.success(`Submit: ${JSON.stringify(values)}`),
            () => message.error("Fix validation errors"),
          )}
        >
          <SchemaForm form={form} items={FORM_DEMO_ITEMS} fetcher={mockFetcher} />
          <div className="flex gap-2">
            <Button type="primary" htmlType="submit">
              Submit
            </Button>
            <Button
              onClick={() => {
                form.reset();
                message.info("Reset");
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </DemoBlock>
    </>
  );
}

function TagDemo() {
  return (
    <>
      <PageHeader title="Tag" description="Compact labels for status, filters, and metadata." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Soft">
          <div className="flex flex-wrap gap-2">
            <Tag>draft</Tag>
            <Tag color="success">active</Tag>
            <Tag color="warning">pending</Tag>
            <Tag color="error">failed</Tag>
            <Tag color="processing">running</Tag>
            <Tag color="brand">pro</Tag>
          </div>
        </DemoBlock>
        <DemoBlock title="Solid">
          <div className="flex flex-wrap gap-2">
            <Tag variant="solid">default</Tag>
            <Tag variant="solid" color="success">
              success
            </Tag>
            <Tag variant="solid" color="warning">
              warning
            </Tag>
            <Tag variant="solid" color="error">
              error
            </Tag>
            <Tag variant="solid" color="processing">
              processing
            </Tag>
            <Tag variant="solid" color="brand">
              brand
            </Tag>
          </div>
        </DemoBlock>
        <DemoBlock title="Without dot">
          <div className="flex flex-wrap gap-2">
            <Tag color="success" dot={false}>
              success
            </Tag>
            <Tag color="blue" dot={false}>
              blue
            </Tag>
            <Tag color="purple" dot={false}>
              purple
            </Tag>
            <Tag color="orange" dot={false}>
              orange
            </Tag>
          </div>
        </DemoBlock>
        <DemoBlock title="Closable">
          <div className="flex flex-wrap gap-2">
            <Tag closable color="processing">
              agent:ops
            </Tag>
            <Tag closable variant="solid" color="brand">
              filter
            </Tag>
            <Tag closable>removable</Tag>
          </div>
        </DemoBlock>
      </div>
    </>
  );
}

type DemoUser = { id: string; name: string; role: string; age: number; email: string };

const TABLE_USERS: DemoUser[] = [
  { id: "1", name: "Ada Lovelace", role: "admin", age: 36, email: "ada@nonla.dev" },
  { id: "2", name: "Bob Martinez", role: "user", age: 28, email: "bob@nonla.dev" },
  { id: "3", name: "Chloe Nguyen", role: "editor", age: 31, email: "chloe@nonla.dev" },
  { id: "4", name: "Diego Silva", role: "user", age: 24, email: "diego@nonla.dev" },
  { id: "5", name: "Elena Petrova", role: "admin", age: 42, email: "elena@nonla.dev" },
  { id: "6", name: "Farid Hassan", role: "editor", age: 29, email: "farid@nonla.dev" },
  { id: "7", name: "Grace Kim", role: "user", age: 33, email: "grace@nonla.dev" },
  { id: "8", name: "Hiro Tanaka", role: "user", age: 27, email: "hiro@nonla.dev" },
  { id: "9", name: "Ivy Chen", role: "editor", age: 35, email: "ivy@nonla.dev" },
  { id: "10", name: "Jules Bernard", role: "admin", age: 40, email: "jules@nonla.dev" },
  { id: "11", name: "Kai Olsen", role: "user", age: 22, email: "kai@nonla.dev" },
  { id: "12", name: "Lina Costa", role: "user", age: 30, email: "lina@nonla.dev" },
];

function roleTag(role: unknown) {
  const color = role === "admin" ? "brand" : role === "editor" ? "processing" : "default";
  return <Tag color={color}>{String(role)}</Tag>;
}

function TableDemo() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(false);

  const columns = [
    { title: "Name", dataIndex: "name" as const, sorter: true as const },
    {
      title: "Role",
      dataIndex: "role" as const,
      render: (v: unknown) => roleTag(v),
    },
    { title: "Age", dataIndex: "age" as const, width: 80, sorter: (a: DemoUser, b: DemoUser) => a.age - b.age },
    { title: "Email", dataIndex: "email" as const, ellipsis: true },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: unknown, record: DemoUser) => (
        <Button type="link" size="small" onClick={() => message.info(`Edit ${record.name}`)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Table" description="Ant Design columns API, shadcn-inspired layout — text-sm, h-10 headers, muted row hover." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic (custom render)">
          <Table
            rowKey="id"
            pagination={false}
            columns={[
              { title: "Name", dataIndex: "name" },
              { title: "Role", dataIndex: "role", render: (v) => roleTag(v) },
            ]}
            dataSource={TABLE_USERS.slice(0, 3)}
          />
        </DemoBlock>

        <DemoBlock title="Sorter + pagination + selection">
          <div className="mb-2 flex items-center gap-2">
            <Button
              size="small"
              loading={loading}
              onClick={() => {
                setLoading(true);
                window.setTimeout(() => setLoading(false), 800);
              }}
            >
              Toggle loading
            </Button>
            <span className="text-xs text-muted-foreground">Selected: {selectedRowKeys.join(", ") || "—"}</span>
          </div>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={TABLE_USERS}
            pagination={{ pageSize: 5 }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            onRow={(record) => ({
              onClick: () => message.info(record.email),
              className: "cursor-pointer",
            })}
          />
        </DemoBlock>

        <DemoBlock title="Bordered + empty">
          <Table rowKey="id" bordered columns={columns} dataSource={[]} pagination={false} />
        </DemoBlock>
      </div>
    </>
  );
}

function EmptyDemo() {
  return (
    <>
      <PageHeader title="Empty" description="Empty state — logo mark + description." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic">
          <Empty description="No data" />
        </DemoBlock>
        <DemoBlock title="With action">
          <Empty className="rounded-lg border border-dashed border-border" description="No projects yet">
            <Button type="primary" size="small" icon={<AddIcon size={14} />}>
              Create project
            </Button>
          </Empty>
        </DemoBlock>
      </div>
    </>
  );
}

function SegmentedDemo() {
  const [seg, setSeg] = useState<string | number>("day");
  return (
    <>
      <PageHeader title="Segmented" description="Display multiple options and allow users to select a single one." />
      <DemoBlock>
        <Segmented options={["day", "week", "month"]} value={seg} onChange={setSeg} />
      </DemoBlock>
    </>
  );
}

function SkeletonDemo() {
  return (
    <>
      <PageHeader title="Skeleton" description="Provide a placeholder while content is loading." />
      <DemoBlock>
        <Skeleton active />
      </DemoBlock>
    </>
  );
}

function TooltipDemo() {
  return (
    <>
      <PageHeader title="Tooltip" description="A simple text popup tip." />
      <DemoBlock>
        <div className="flex flex-wrap gap-2">
          <Tooltip title="Tooltip text">
            <Button>Hover me</Button>
          </Tooltip>
          <Tooltip title="Bottom" placement="bottom">
            <Button>Bottom</Button>
          </Tooltip>
          <Tooltip title="Left" placement="left">
            <Button>Left</Button>
          </Tooltip>
        </div>
      </DemoBlock>
    </>
  );
}

function PopoverDemo() {
  return (
    <>
      <PageHeader title="Popover" description="The floating card popped by clicking or hovering." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic">
          <Popover content={<div className="text-sm">Popover body</div>} title="Title">
            <Button>Open Popover</Button>
          </Popover>
        </DemoBlock>
        <DemoBlock title="No title">
          <Popover content={<div className="text-sm">Just the body — no title row.</div>}>
            <Button>No title</Button>
          </Popover>
        </DemoBlock>
        <DemoBlock title="Arrow">
          <Popover arrow content={<div className="text-sm">Popover with arrow</div>} title="Title">
            <Button>With arrow</Button>
          </Popover>
        </DemoBlock>
        <DemoBlock title="Placement">
          <div className="flex flex-wrap gap-2">
            {(["top", "bottom", "left", "right"] as const).map((placement) => (
              <Popover key={placement} arrow placement={placement} title="Title" content={<div className="text-sm">placement="{placement}"</div>}>
                <Button>{placement[0]!.toUpperCase() + placement.slice(1)}</Button>
              </Popover>
            ))}
          </div>
        </DemoBlock>
        <DemoBlock title="Hover / corner">
          <div className="flex flex-wrap gap-2">
            <Popover trigger="hover" mouseEnterDelay={0.15} content={<div className="text-sm">Hover me</div>}>
              <Button>Hover</Button>
            </Popover>
            <Popover placement="bottomLeft" content={<div className="text-sm">bottomLeft</div>}>
              <Button>bottomLeft</Button>
            </Popover>
          </div>
        </DemoBlock>
        <DemoBlock title="No padding">
          <Popover
            contentClassName="p-0"
            content={
              <div className="w-44 py-1 text-sm">
                {["Profile", "Settings", "Sign out"].map((label) => (
                  <button key={label} type="button" className="block w-full px-3 py-1.5 text-left hover:bg-secondary">
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <Button>No padding</Button>
          </Popover>
        </DemoBlock>
      </div>
    </>
  );
}

const CODE_BASIC = `export default function MyApp() {
  return (
    <div>
      <h1>Welcome to my app</h1>
      <MyButton />
    </div>
  );
}`;

const CODE_BUTTON = `export function MyButton() {
  return (
    <button className="rounded bg-brand px-4 py-2 text-white">
      Click me
    </button>
  );
}`;

function CodeBlockDemo() {
  return (
    <>
      <PageHeader title="CodeBlock" description="Syntax-highlighted snippets with copy — sugar-high, inspired by pheralb/code-blocks." />
      <DemoBlock title="Basic">
        <CodeBlock code={CODE_BASIC} language="tsx" />
      </DemoBlock>
      <DemoBlock title="Header + line numbers">
        <CodeBlock code={CODE_BUTTON} language="tsx" title="MyButton.tsx" lineNumbers />
      </DemoBlock>
      <DemoBlock title="Word wrap">
        <CodeBlock code={`const className = "rounded bg-brand px-4 py-2 text-white transition-colors duration-200 hover:bg-brand-soft focus:ring-2 focus:ring-brand focus:outline-none";`} language="ts" title="long-line.ts" wordWrap />
      </DemoBlock>
      <DemoBlock title="JSON">
        <CodeBlock code={`{\n  "name": "@nonla-agents/ui",\n  "private": true,\n  "type": "module"\n}`} language="json" title="package.json" lineNumbers />
      </DemoBlock>
    </>
  );
}

function MessageDemo() {
  return (
    <>
      <PageHeader title="Message" description="Display global messages as feedback in response to user operations." />
      <DemoBlock>
        <div className="flex flex-wrap gap-2">
          <Button type="primary" onClick={() => message.success("Saved")}>
            Success
          </Button>
          <Button danger onClick={() => message.error("Failed")}>
            Error
          </Button>
          <Button onClick={() => message.info("Heads up")}>Info</Button>
          <Button onClick={() => message.warning("Be careful")}>Warning</Button>
          <Button
            onClick={() => {
              const hide = message.loading("Saving…", 0);
              window.setTimeout(() => {
                hide();
                message.success("Done");
              }, 1500);
            }}
          >
            Loading
          </Button>
        </div>
      </DemoBlock>
    </>
  );
}

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Modal" description="Display a dialog for user decisions or extra content." />
      <DemoBlock>
        <div className="flex flex-wrap gap-2">
          <Button type="primary" onClick={() => setOpen(true)}>
            Open Modal
          </Button>
          <Button
            onClick={() =>
              Modal.confirm({
                title: "Delete item?",
                content: "This cannot be undone.",
                okText: "Delete",
                okButtonProps: { danger: true },
                onOk: async () => {
                  message.success("Deleted");
                },
              })
            }
          >
            Modal.confirm
          </Button>
        </div>
      </DemoBlock>
      <Modal open={open} title="Example modal" onCancel={() => setOpen(false)} onOk={() => setOpen(false)}>
        <p className="m-0 text-sm text-muted-foreground">Modal body content.</p>
      </Modal>
    </>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  const [bottom, setBottom] = useState(false);
  return (
    <>
      <PageHeader title="Drawer" description="A panel which slides in from the edge of the screen." />
      <DemoBlock>
        <div className="flex flex-wrap gap-2">
          <Button type="primary" onClick={() => setOpen(true)}>
            Open Drawer
          </Button>
          <Button onClick={() => setBottom(true)}>Bottom + extra</Button>
        </div>
      </DemoBlock>
      <Drawer open={open} title="Example drawer" onClose={() => setOpen(false)} size={420}>
        <p className="m-0 text-sm text-muted-foreground">Drawer body content.</p>
      </Drawer>
      <Drawer
        open={bottom}
        title="Runs"
        extra={
          <Button size="small" type="primary" onClick={() => message.info("Run")}>
            Run
          </Button>
        }
        placement="bottom"
        size="40%"
        onClose={() => setBottom(false)}
        styles={{ body: { padding: 16 } }}
      >
        <p className="m-0 text-sm text-muted-foreground">Bottom drawer with extra actions in the header.</p>
      </Drawer>
    </>
  );
}

function PopconfirmDemo() {
  return (
    <>
      <PageHeader title="Popconfirm" description="A simple and compact confirmation dialog of an action." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Basic">
          <Popconfirm
            title="Delete the task"
            description="Are you sure you want to delete this task?"
            okText="Delete"
            okType="danger"
            onConfirm={() => {
              message.success("Deleted");
            }}
          >
            <Button danger>Delete</Button>
          </Popconfirm>
        </DemoBlock>
        <DemoBlock title="Placement">
          <div className="flex flex-wrap gap-2">
            <Popconfirm
              title="Confirm?"
              placement="top"
              onConfirm={() => {
                message.success("OK");
              }}
            >
              <Button>Top</Button>
            </Popconfirm>
            <Popconfirm
              title="Confirm?"
              placement="bottom"
              onConfirm={() => {
                message.success("OK");
              }}
            >
              <Button>Bottom</Button>
            </Popconfirm>
            <Popconfirm
              title="Confirm?"
              placement="left"
              onConfirm={() => {
                message.success("OK");
              }}
            >
              <Button>Left</Button>
            </Popconfirm>
            <Popconfirm
              title="Confirm?"
              placement="right"
              onConfirm={() => {
                message.success("OK");
              }}
            >
              <Button>Right</Button>
            </Popconfirm>
          </div>
        </DemoBlock>
        <DemoBlock title="Custom icon / async">
          <div className="flex flex-wrap gap-2">
            <Popconfirm
              title="No icon"
              icon={null}
              onConfirm={() => {
                message.info("Done");
              }}
            >
              <Button>No icon</Button>
            </Popconfirm>
            <Popconfirm
              title="Save changes?"
              description="This may take a moment."
              okText="Save"
              onConfirm={async () => {
                await new Promise((r) => window.setTimeout(r, 1000));
                message.success("Saved");
              }}
            >
              <Button type="primary">Async OK</Button>
            </Popconfirm>
          </div>
        </DemoBlock>
      </div>
    </>
  );
}

function SpinDemo() {
  return (
    <>
      <PageHeader title="Spin" description="Loading indicators — default, AI agent, and nested sub-agent." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Variants">
          <div className="flex flex-wrap items-end gap-8">
            <Spin tip="Loading…" />
            <Spin variant="agent" tip="Agent working…" />
            <Spin variant="subAgent" tip="Sub-agent…" />
          </div>
        </DemoBlock>
        <DemoBlock title="Nested content">
          <Spin variant="agent" tip="Generating…">
            <div className="min-h-24 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Content under agent spin</div>
          </Spin>
        </DemoBlock>
      </div>
    </>
  );
}

function DropdownDemo() {
  return (
    <>
      <PageHeader title="Dropdown" description="A dropdown list." />
      <DemoBlock>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{
            style: { minWidth: 180 },
            items: [
              { key: "1", label: "Edit" },
              {
                key: "move",
                label: "Move to team",
                children: [
                  { key: "t1", label: "Alpha" },
                  { key: "t2", label: "Beta", disabled: true },
                ],
              },
              { type: "divider" },
              { key: "2", label: "Delete", danger: true },
            ],
            onClick: ({ key }) => message.info(`Menu ${key}`),
          }}
        >
          <Button>Click menu</Button>
        </Dropdown>
      </DemoBlock>
    </>
  );
}

function PaginationDemo() {
  const [page, setPage] = useState(1);
  return (
    <>
      <PageHeader title="Pagination" description="A long list can be divided into several pages." />
      <DemoBlock>
        <Pagination current={page} total={42} pageSize={10} onChange={(p) => setPage(p)} />
      </DemoBlock>
    </>
  );
}

function ChatConversationDemo() {
  const [generating, setGenerating] = useState(false);
  return (
    <>
      <PageHeader title="Conversation" description="Composed chat agent surface — mirrors the web agent chat layout." />
      <DemoBlock>
        <div className="flex h-130 flex-col overflow-hidden rounded-xl border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            <ChatUserMessage content="Summarize what's in my calendar tomorrow and draft a short standup note." />
            <ChatThinking thinking={"Checking calendar tools…\nLooking at tomorrow's events and preparing a concise standup draft."} duration={2} />
            <ChatToolCall
              toolName="get_calendar_events"
              toolInput={{ date: "2026-09-01", timezone: "Asia/Ho_Chi_Minh" }}
              toolOutput={{
                events: [
                  { title: "Standup", at: "09:30" },
                  { title: "Design review", at: "14:00" },
                ],
              }}
              showAvatar
              assistantLabel="Assistant"
              defaultOpen
            />
            <ChatAgentMessage>
              <p className="m-0 mb-3">
                Tomorrow you have <strong>Standup</strong> at 09:30 and a <strong>Design review</strong> at 14:00.
              </p>
              <p className="m-0 mb-1 font-medium">Standup draft:</p>
              <ul className="m-0 pl-5">
                <li>Calendar check done</li>
                <li>Prep design review notes</li>
                <li>Ship NonlaUI chat primitives</li>
              </ul>
            </ChatAgentMessage>
            <ChatError>Model rate limit — retry in a moment.</ChatError>
          </div>
          <ChatInput
            generating={generating}
            placeholder="Message the agent…"
            onSend={() => {
              setGenerating(true);
              window.setTimeout(() => setGenerating(false), 1800);
              message.success("Sent");
            }}
            onCancel={() => setGenerating(false)}
            toolbar={<span className="px-1.5 text-[11px] text-muted-foreground">gpt-4.1-mini · 3 tools</span>}
          />
        </div>
      </DemoBlock>
    </>
  );
}

function ChatWelcomeDemo() {
  return (
    <>
      <PageHeader title="Welcome" description="Empty chat state with agent intro and starter prompts." />
      <DemoBlock>
        <div className="min-h-80 rounded-xl border border-border bg-background">
          <ChatWelcome name="Nova" description="Helps with research, drafting, and tool-using workflows." modelLabel="gpt-4.1-mini" toolCount={4} onStarter={(text) => message.info(text)} />
        </div>
      </DemoBlock>
    </>
  );
}

function ChatUserDemo() {
  return (
    <>
      <PageHeader title="User message" description="User bubble with overflow expand / collapse." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Short">
          <ChatUserMessage content="Can you review this PR?" />
        </DemoBlock>
        <DemoBlock title="Long (expand)">
          <ChatUserMessage content={["Here is a longer prompt that should overflow the bubble height.", "", ...Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: please consider edge cases around auth, streaming, and tool errors.`)].join("\n")} />
        </DemoBlock>
      </div>
    </>
  );
}

function ChatAgentDemo() {
  return (
    <>
      <PageHeader title="Agent message" description="Assistant reply — pass markdown-ready children or plain text." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Plain text">
          <ChatAgentMessage content="I'll pull the latest metrics and draft a short summary for the team." />
        </DemoBlock>
        <DemoBlock title="With thinking">
          <ChatAgentMessage thinking="Need to call get_metrics, then summarize by product area." thinkingDuration={3} content="Revenue is up 12% WoW. Support volume is flat." />
        </DemoBlock>
      </div>
    </>
  );
}

function ChatThinkingDemo() {
  return (
    <>
      <PageHeader title="Thinking" description="Collapsible reasoning indicator — streaming or finished." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Finished">
          <ChatThinking thinking={"Plan:\n1. Inspect the failing test\n2. Fix the assertion\n3. Re-run the suite"} duration={4} />
        </DemoBlock>
        <DemoBlock title="Streaming">
          <ChatThinking thinking="Still gathering context from the codebase…" streaming />
        </DemoBlock>
      </div>
    </>
  );
}

function ChatToolDemo() {
  return (
    <>
      <PageHeader title="Tool call" description="Expandable tool card with input / output / running / error." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Done">
          <ChatToolCall toolName="read_file" toolInput={{ path: "src/web/App.tsx" }} toolOutput={{ lines: 120, preview: "export default function App() { … }" }} showAvatar assistantLabel="Assistant" defaultOpen />
        </DemoBlock>
        <DemoBlock title="Running">
          <ChatToolCall toolName="run_script" toolInput={{ name: "typecheck" }} running defaultOpen />
        </DemoBlock>
        <DemoBlock title="Error">
          <ChatToolCall toolName="browser_navigate" toolInput={{ url: "https://example.com" }} toolError="Timed out after 30s" defaultOpen />
        </DemoBlock>
      </div>
    </>
  );
}

function ChatInputDemo() {
  const [generating, setGenerating] = useState(false);
  return (
    <>
      <PageHeader title="Input" description="Composer with send / stop — toolbar slot for model & tools." />
      <div className="flex flex-col gap-4">
        <DemoBlock title="Idle">
          <ChatInput placeholder="Message…" onSend={(t) => message.success(`Sent: ${t}`)} toolbar={<span className="px-1.5 text-[11px] text-muted-foreground">Select model</span>} />
        </DemoBlock>
        <DemoBlock title="Generating">
          <ChatInput generating placeholder="…" onSend={() => undefined} onCancel={() => message.info("Stopped")} />
        </DemoBlock>
        <DemoBlock title="Interactive">
          <ChatInput
            generating={generating}
            placeholder="Try Enter to send…"
            onSend={() => {
              setGenerating(true);
              window.setTimeout(() => setGenerating(false), 1500);
            }}
            onCancel={() => setGenerating(false)}
            autoFocus
          />
        </DemoBlock>
      </div>
    </>
  );
}

const DEMOS: Record<DemoId, () => ReactNode> = {
  button: ButtonDemo,
  input: InputDemo,
  "input-number": InputNumberDemo,
  select: SelectDemo,
  datepicker: DatePickerDemo,
  timepicker: TimePickerDemo,
  switch: SwitchDemo,
  checkbox: CheckboxDemo,
  form: FormDemo,
  tag: TagDemo,
  table: TableDemo,
  empty: EmptyDemo,
  segmented: SegmentedDemo,
  skeleton: SkeletonDemo,
  tooltip: TooltipDemo,
  popover: PopoverDemo,
  codeblock: CodeBlockDemo,
  message: MessageDemo,
  modal: ModalDemo,
  drawer: DrawerDemo,
  popconfirm: PopconfirmDemo,
  spin: SpinDemo,
  dropdown: DropdownDemo,
  pagination: PaginationDemo,
  "chat-conversation": ChatConversationDemo,
  "chat-welcome": ChatWelcomeDemo,
  "chat-user": ChatUserDemo,
  "chat-agent": ChatAgentDemo,
  "chat-thinking": ChatThinkingDemo,
  "chat-tool": ChatToolDemo,
  "chat-input": ChatInputDemo,
};

function NavLinkButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["group flex h-9 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-[13px] transition-colors", active ? "bg-white/8 font-medium text-brand-soft" : "font-normal text-muted-foreground hover:bg-white/4 hover:text-foreground"].join(" ")}
    >
      {icon ? <span className={["flex size-4 shrink-0 items-center justify-center [&_svg]:size-4", active ? "text-brand-soft" : "text-quaternary-foreground group-hover:text-foreground"].join(" ")}>{icon}</span> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function NonlaUiDemoPage() {
  const [active, setActive] = useState<DemoId>(() => (typeof window !== "undefined" ? readHash() : "button"));
  const [mobileNav, setMobileNav] = useState(false);
  const [panel, setPanel] = useState<"main" | "chat">(() => (typeof window !== "undefined" && isChatDemo(readHash()) ? "chat" : "main"));

  useEffect(() => {
    const onHash = () => {
      const id = readHash();
      setActive(id);
      if (isChatDemo(id)) setPanel("chat");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Lock page scroll while the mobile drawer is open
  useEffect(() => {
    if (!mobileNav) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [mobileNav]);

  // Desktop breakpoint → force-close drawer (avoids stuck open / mid-resize jank)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (mq.matches) setMobileNav(false);
    };
    close();
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  const select = (id: DemoId) => {
    setActive(id);
    window.location.hash = id;
    if (isChatDemo(id)) setPanel("chat");
    setMobileNav(false);
  };

  const openChatPanel = () => {
    setPanel("chat");
    if (!isChatDemo(active)) {
      setActive("chat-conversation");
      window.location.hash = "chat-conversation";
    }
  };

  const backToMain = () => {
    setPanel("main");
    if (isChatDemo(active)) {
      setActive("button");
      window.location.hash = "button";
    }
  };

  const ActiveDemo = useMemo(() => DEMOS[active], [active]);
  const activeLabel = [...NAV.flatMap((g) => g.items), ...CHAT_NAV].find((i) => i.id === active)?.label ?? active;
  const crumbRoot = isChatDemo(active) ? "Chat Agent" : "Components";

  const drawerEase = "cubic-bezier(0.32, 0.72, 0, 1)";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Mobile backdrop — fades with the drawer (always mounted) */}
      <button
        type="button"
        aria-label="Close nav"
        tabIndex={mobileNav ? 0 : -1}
        aria-hidden={!mobileNav}
        onClick={() => setMobileNav(false)}
        className={["fixed inset-0 z-30 border-0 bg-black/40 md:hidden", "transition-opacity duration-300 motion-reduce:transition-none", mobileNav ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"].join(" ")}
        style={{ transitionTimingFunction: drawerEase }}
      />

      {/*
        Sidebar: one node for desktop (in-flow) + mobile (fixed overlay).
        Avoid max-md:fixed-only quirks — use fixed by default, md:static to re-enter flow.
      */}
      <aside
        className={[
          "flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-[#141414]",
          // Mobile overlay drawer
          "fixed inset-y-0 left-0 z-40 shadow-2xl",
          "transform-gpu transition-transform duration-300 motion-reduce:transition-none",
          mobileNav ? "translate-x-0" : "-translate-x-full",
          // Desktop: sit in the flex row, never translated
          "md:static md:z-auto md:translate-x-0 md:shadow-none md:transition-none",
        ].join(" ")}
        style={{ transitionTimingFunction: drawerEase }}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight text-foreground">NonlaUI</span>
          <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-soft">demo</span>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className={["flex h-full w-[200%] transform-gpu transition-transform duration-300 motion-reduce:transition-none", panel === "chat" ? "-translate-x-1/2" : "translate-x-0"].join(" ")} style={{ transitionTimingFunction: drawerEase }}>
            {/* Level 1 — components */}
            <nav className="flex h-full w-1/2 flex-col overflow-y-auto px-2 py-3">
              {NAV.map((group) => (
                <div key={group.title} className="mb-3">
                  <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-quaternary-foreground">{group.title}</div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <NavLinkButton key={item.id} label={item.label} icon={item.icon} active={item.id === active} onClick={() => select(item.id)} />
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-auto border-t border-border pt-2">
                <NavLinkButton label="Chat Agent" icon={<BotIcon {...ICON} />} active={isChatDemo(active) || panel === "chat"} onClick={openChatPanel} />
              </div>
            </nav>

            {/* Level 2 — chat agent */}
            <nav className="flex h-full w-1/2 flex-col overflow-y-auto px-2 py-3">
              <button type="button" onClick={backToMain} aria-label="Back to components" className="group mb-2 flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent px-0.5 text-left">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white/6 text-muted-foreground transition-colors group-hover:bg-white/10 group-hover:text-foreground">
                  <span className="flex size-4 items-center justify-center transition-transform duration-150 group-hover:-translate-x-px motion-reduce:transition-none [&_svg]:size-4">
                    <AltArrowLeftIcon size={16} weight="Bold" />
                  </span>
                </span>
                <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">Chat Agent</span>
              </button>
              <div className="mb-2 h-px bg-border" />
              <div className="flex flex-col gap-0.5">
                {CHAT_NAV.map((item) => (
                  <NavLinkButton key={item.id} label={item.label} icon={item.icon} active={item.id === active} onClick={() => select(item.id)} />
                ))}
              </div>
            </nav>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 text-[11px] text-quaternary-foreground">@nonla-agents/ui</div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-8">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border-0 bg-transparent text-foreground transition-colors hover:bg-white/6 active:bg-white/10 md:hidden"
            onClick={() => setMobileNav((v) => !v)}
            aria-label={mobileNav ? "Close nav" : "Open nav"}
            aria-expanded={mobileNav}
          >
            <HamburgerMenuIcon size={18} weight="Bold" />
          </button>
          <div className="text-[13px] text-muted-foreground">
            {crumbRoot} <span className="mx-1.5 text-quaternary-foreground">/</span> <span className="text-foreground">{activeLabel}</span>
          </div>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 md:px-10 md:py-10">
            <ActiveDemo />
          </div>
        </main>
      </div>
    </div>
  );
}
