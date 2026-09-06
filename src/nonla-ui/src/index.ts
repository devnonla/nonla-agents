export { App, useAppConfig } from "./app/App";
export type { AppProps, NonlaAppConfig } from "./app/App";

export { Button } from "./button/Button";
export type { ButtonProps, ButtonGroupProps, ButtonType, ButtonSize, ButtonColor, ButtonVariant } from "./button/Button";

export { Input, TextArea, InputNumber } from "./input/Input";
export type { InputProps, TextAreaProps, InputNumberProps, InputSize, TextAreaRef, PasswordProps } from "./input/Input";
export { SearchInput } from "./input/SearchInput";
export type { SearchInputProps } from "./input/SearchInput";
/** antd `InputRef` compatibility — native input element. */
export type InputRef = HTMLInputElement;

export { Select, SelectOption } from "./select/Select";
export type { SelectProps, SelectOptionConfig, SelectValue } from "./select/Select";

export { Switch } from "./switch/Switch";
export type { SwitchProps, SwitchVariant } from "./switch/Switch";

export { Checkbox } from "./checkbox/Checkbox";
export type { CheckboxProps } from "./checkbox/Checkbox";

export { ColorPicker } from "./colorpicker/ColorPicker";
export type { ColorPickerProps } from "./colorpicker/ColorPicker";

export { Tooltip } from "./tooltip/Tooltip";
export type { TooltipProps, TooltipPlacement } from "./tooltip/Tooltip";

export { Modal } from "./modal/Modal";
export type { ModalProps, ModalConfirmProps } from "./modal/Modal";

export { message } from "./message/message";
export type { MessageType, MessageConfig } from "./message/message";

export {
  SchemaForm,
  FormSchema,
  FormItem,
  EFormItemType,
  hydrateRules,
  fieldNameOf,
  isRuleRequired,
} from "./form";
export type {
  SchemaFormProps,
  FormItemProps,
  FormFetcher,
  TForm,
  TFormItemProps,
  TFormRule,
  TRuleValueMessage,
  ISelectItemProps,
  IFormItemHelpProps,
} from "./form";

/** Layout-only Form + Form.Item (antd drop-in for labeled fields). */
export { Form } from "./form-layout/FormLayout";
export type { FormLayoutProps, FormLayoutItemProps } from "./form-layout/FormLayout";

export { Alert } from "./alert/Alert";
export type { AlertProps, AlertType } from "./alert/Alert";

export { Popover } from "./popover/Popover";
export type { PopoverProps } from "./popover/Popover";

export { Dropdown } from "./dropdown/Dropdown";
export type { DropdownProps, MenuItemType, MenuProps } from "./dropdown/Dropdown";

export { Popconfirm } from "./popconfirm/Popconfirm";
export type { PopconfirmProps } from "./popconfirm/Popconfirm";

export { Drawer } from "./drawer/Drawer";
export type { DrawerProps, DrawerPlacement } from "./drawer/Drawer";

export { Table } from "./table/Table";
export type {
  TableProps,
  ColumnType,
  ColumnsType,
  TablePaginationConfig,
  TableRowSelection,
  SortOrder,
} from "./table/Table";

export { Tag } from "./tag/Tag";
export type { TagProps, TagVariant } from "./tag/Tag";

export { Pagination } from "./pagination/Pagination";
export type { PaginationProps, PaginationItemType } from "./pagination/Pagination";

export { Empty } from "./empty/Empty";
export type { EmptyProps } from "./empty/Empty";

export { Spin } from "./spin/Spin";
export type { SpinProps, SpinVariant } from "./spin/Spin";

export { Skeleton } from "./skeleton/Skeleton";
export type { SkeletonProps } from "./skeleton/Skeleton";

export { Segmented } from "./segmented/Segmented";
export type { SegmentedProps, SegmentedOption } from "./segmented/Segmented";

export { DatePicker, RangePicker } from "./datepicker/DatePicker";
export type { DatePickerProps, RangePickerProps, RangeValue } from "./datepicker/DatePicker";

export { TimePicker } from "./timepicker/TimePicker";
export type { TimePickerProps, TimeValue } from "./timepicker/TimePicker";

export { Calendar } from "./calendar/Calendar";
export type { CalendarProps } from "./calendar/Calendar";

export { CodeBlock, CodeBlockCopyButton } from "./codeblock/CodeBlock";
export type { CodeBlockProps, CodeBlockCopyButtonProps } from "./codeblock/CodeBlock";

export {
  ChatThinking,
  ChatUserMessage,
  ChatAgentMessage,
  ChatError,
  ChatToolCall,
  ChatInput,
  ChatWelcome,
  ChatSpinner,
  ChatMarkdown,
  createChatMarkdownComponents,
  chatMarkdownComponents,
  chatMarkdownClass,
  chatBodyClass,
  MermaidBlock,
  formatToolName,
  prettyJson,
} from "./chat";
export type {
  ChatThinkingProps,
  ChatUserMessageProps,
  ChatAgentMessageProps,
  ChatErrorProps,
  ChatToolCallProps,
  ChatInputProps,
  ChatWelcomeProps,
  ChatMarkdownProps,
  ChatMarkdownStreamState,
  MermaidBlockProps,
} from "./chat";

export { cn } from "./lib/cn";
export { CONTROL_SIZES, normalizeSize, getSizeTokens, controlHeightVar, controlRadiusVar, controlStatusClass } from "./lib/sizes";
export type { ControlSize, CanonicalSize, ControlSizeTokens } from "./lib/sizes";
export { placementToRadix } from "./lib/placement";
export type { PopperPlacement } from "./lib/placement";
export { NONLA_THEME_KNOBS, NONLA_THEME_KEYS, applyNonlaTheme } from "./theme";
export type { NonlaThemeKnob, NonlaThemeKnobName, NonlaThemeColorName, NonlaThemeColors, NonlaThemeConfig } from "./theme";
