import type { ReactNode } from "react";
import type { ControllerFieldState, ControllerRenderProps, FieldValues, RegisterOptions, Validate } from "react-hook-form";
import type { EFormItemType } from "./enum";

export type TFormItemRenderCtx = {
  field: ControllerRenderProps<FieldValues, string>;
  fieldState: ControllerFieldState;
  status?: "error" | "warning";
};

type TFormItemCondition = "==" | "!=" | ">=" | "<=" | ">" | "<";

type TFormItemConditions = [string, TFormItemCondition, unknown];

export interface ISelectItemProps {
  label: string;
  value: string | number;
}

export interface IFormItemHelpProps {
  text: string;
  className?: string;
  iconClassName?: string;
}

/** JSON-serializable rule value with message (RHF min/max/minLength/maxLength shape). */
export type TRuleValueMessage<T = number> = {
  value: T;
  message?: string;
};

/**
 * Serializable rules for BE → FE forms.
 * `pattern.value` is a string in JSON; hydrated to RegExp via `hydrateRules`.
 * Client-only `validate` may be a function when composing schema in TS.
 */
export type TFormRule = {
  required?: string | boolean;
  min?: number | TRuleValueMessage;
  max?: number | TRuleValueMessage;
  minLength?: number | TRuleValueMessage;
  maxLength?: number | TRuleValueMessage;
  pattern?: { value: string | RegExp; message?: string };
  validate?: Validate<unknown, unknown> | Record<string, Validate<unknown, unknown>>;
};

export type TFormItemBase = {
  type: EFormItemType;
  label?: string;
  collapsable?: boolean;
  name: string | string[] | number[];
  defaultValue?: unknown;
  rules?: TFormRule;
  helps?: IFormItemHelpProps[];
  conditions?: Array<Array<TFormItemConditions>>;
  options?: Record<string, unknown>;
  colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  className?: string;
  labelClassName?: string;
  innerClassName?: string;
};

export type TFormItemInput = TFormItemBase & {
  type: EFormItemType.Input;
};

export type TFormItemTextarea = TFormItemBase & {
  type: EFormItemType.Textarea;
};

export type TFormItemNumber = TFormItemBase & {
  type: EFormItemType.Number;
};

export type TFormItemColor = TFormItemBase & {
  type: EFormItemType.Color;
};

export type TFormItemRadio = TFormItemBase & {
  type: EFormItemType.Radio;
  choices: ISelectItemProps[];
};

export type TFormItemSelect = TFormItemBase & {
  type: EFormItemType.Select;
  choices: ISelectItemProps[];
};

export type TFormItemSelectMultiple = TFormItemBase & {
  type: EFormItemType.SelectMultiple;
  choices: ISelectItemProps[];
};

export type TFormItemSelectRemote = TFormItemBase & {
  type: EFormItemType.SelectRemote;
  endpoint: string;
  keyProp: string;
  labelProp: string;
  dataProp?: string;
};

export type TFormItemDateTime = TFormItemBase & {
  type: EFormItemType.DateTime;
};

export type TFormItemTime = TFormItemBase & {
  type: EFormItemType.Time;
};

export type TFormItemRepeater = TFormItemBase & {
  type: EFormItemType.Repeater;
  childItems?: TFormItemProps[];
};

export type TFormItemObject = TFormItemBase & {
  type: EFormItemType.Object;
  childItems?: TFormItemProps[];
};

export type TFormItemHidden = TFormItemBase & {
  type: EFormItemType.Hidden;
};

export type TFormItemSwitch = TFormItemBase & {
  type: EFormItemType.Switch;
};

export type TFormItemCheckbox = TFormItemBase & {
  type: EFormItemType.Checkbox;
};

export type TFormItemJson = TFormItemBase & {
  type: EFormItemType.JSON;
};

export type TFormItemEditor = TFormItemBase & {
  type: EFormItemType.Editor;
};

export type TFormItemCustom = TFormItemBase & {
  type: EFormItemType.Custom;
  render: (ctx: TFormItemRenderCtx) => ReactNode;
};

export type TFormItemProps =
  | TFormItemInput
  | TFormItemTextarea
  | TFormItemNumber
  | TFormItemRepeater
  | TFormItemSelect
  | TFormItemSelectMultiple
  | TFormItemDateTime
  | TFormItemTime
  | TFormItemSelectRemote
  | TFormItemObject
  | TFormItemColor
  | TFormItemRadio
  | TFormItemHidden
  | TFormItemSwitch
  | TFormItemCheckbox
  | TFormItemJson
  | TFormItemEditor
  | TFormItemCustom
  | TFormItemBase;

export type TForm = TFormItemProps[];

/** After hydrate — RHF RegisterOptions (pattern is RegExp). */
export type THydratedRules = RegisterOptions;
